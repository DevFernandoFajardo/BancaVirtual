import { ConflictException, Injectable, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { encrypt } from '../common/crypto.util';
import { ClientesService } from '../clientes/clientes.service';
import { CpGestionesService } from '../cp/cp-gestiones.service';
import { CoreClient } from '../core/core.client';
import { CoreEvaluacionRequest } from '../core/core.types';
import { DatabaseService, PG_UNIQUE_VIOLATION } from '../database/database.service';
import { PrestamosService } from '../prestamos/prestamos.service';
import { CONDICIONES_CREDITO, esCredito } from '../prestamos/prestamos.schema';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { TarjetasService } from '../tarjetas/tarjetas.service';
import {
  CambiarEstadoDto,
  CrearSolicitudDto,
  ESTADOS_VIGENTES,
  FiltroSolicitudesDto,
  SOLICITUD_COLS,
  Solicitud,
} from './solicitudes.schema';

@Injectable()
export class SolicitudesService {
  private readonly logger = new Logger(SolicitudesService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly core: CoreClient,
    private readonly notificaciones: NotificacionesService,
    private readonly tarjetas: TarjetasService,
    private readonly clientes: ClientesService,
    private readonly cpGestiones: CpGestionesService,
    private readonly prestamos: PrestamosService,
    config: ConfigService,
  ) {
    const n = Number(config.get('EVALUACION_DEMORA_SEGUNDOS') ?? 60);
    this.demoraSegundos = Number.isFinite(n) && n >= 0 ? Math.floor(n) : 60;
  }

  /** Espera de demostración antes de mostrar el resultado al cliente (0 = inmediato) */
  private readonly demoraSegundos: number;

  /**
   * Paso 1: el cliente envía el formulario. Se evalúa de inmediato en el CORE (así los errores de datos se
   * ven al instante), pero el resultado se mantiene oculto hasta `resultado_visible_at` (espera de demostración).
   */
  async crear(clienteId: string, dto: CrearSolicitudDto) {
    const vigente = await this.db.one(
      'SELECT 1 FROM solicitudes WHERE cliente_id = $1 AND producto_codigo = $2 AND estado = ANY($3::text[])',
      [clienteId, dto.productoCodigo, ESTADOS_VIGENTES],
    );
    if (vigente) throw new ConflictException('Ya tienes una solicitud vigente para este producto');

    const payload: CoreEvaluacionRequest = {
      productoCodigo: dto.productoCodigo,
      primerNombre: dto.primerNombre.trim(),
      primerApellido: dto.primerApellido.trim(),
      nit: dto.nit,
      dpi: dto.dpi,
      fechaNacimiento: dto.fechaNacimiento,
      ingresosMensuales: dto.ingresosMensuales,
      tipoEmpleo: dto.tipoEmpleo,
      antiguedadLaboralMeses: dto.antiguedadLaboralMeses,
    };

    const evaluacion = await this.core.evaluar(payload);
    // Los datos detallados que se piden aquí quedan en el perfil del cliente (se envían luego a CP Gestiones al aceptar)
    await this.db.query(
      `UPDATE clientes SET nit_cifrado = $2, ingresos_mensuales = $3, tipo_empleo = $4, antiguedad_laboral_meses = $5, updated_at = now() WHERE id = $1`,
      [clienteId, encrypt(dto.nit), dto.ingresosMensuales.toFixed(2), dto.tipoEmpleo, dto.antiguedadLaboralMeses],
    );
    const politicas = [...(evaluacion.Politicas ?? [])].sort((a, b) => a.Orden - b.Orden);

    try {
      const s = await this.db.one<Solicitud>(
        `INSERT INTO solicitudes
           (cliente_id, producto_codigo, producto_nombre, evaluacion_id, resultado_general, resultado_etiqueta,
            politicas, sib, estado, resultado_visible_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, 'EN_EVALUACION', now() + make_interval(secs => $9))
         RETURNING ${SOLICITUD_COLS}`,
        [
          clienteId,
          evaluacion.ProductoCodigo ?? dto.productoCodigo,
          evaluacion.ProductoNombre ?? null,
          evaluacion.EvaluacionId,
          evaluacion.ResultadoGeneral,
          evaluacion.ResultadoGeneralEtiqueta ?? null,
          JSON.stringify(politicas),
          JSON.stringify(evaluacion.Sib ?? null),
          this.demoraSegundos,
        ],
      );
      if (dto.montoSolicitado) {
        // Columna agregada por database/04_cp_gestiones.sql; si aún no existe, la solicitud sigue igual
        await this.db
          .query('UPDATE solicitudes SET monto_solicitado = $2 WHERE id = $1', [s!.id, dto.montoSolicitado.toFixed(2)])
          .catch(() => undefined);
      }
      const cond = CONDICIONES_CREDITO[dto.productoCodigo];
      if (cond && dto.plazoMeses) {
        // Plazo (cuotas) que desea el cliente; el banco puede ajustarlo al aprobar. Columna de database/05
        await this.db
          .query('UPDATE solicitudes SET plazo_meses = $2 WHERE id = $1', [s!.id, Math.min(dto.plazoMeses, cond.plazoMax)])
          .catch(() => undefined);
      }
      await this.liberarResultados(); // con demora 0 el resultado queda disponible al instante
      return this.toView((await this.db.one<Solicitud>(`SELECT ${SOLICITUD_COLS} FROM solicitudes WHERE id = $1`, [s!.id]))!);
    } catch (err: any) {
      // Dos solicitudes simultáneas: el índice único parcial de la BD decide
      if (err?.code === PG_UNIQUE_VIOLATION) throw new ConflictException('Ya tienes una solicitud vigente para este producto');
      throw err;
    }
  }

  /** Pasa a "resultado disponible" las solicitudes cuya espera ya terminó (sin tareas en memoria: sobrevive reinicios). */
  private async liberarResultados() {
    await this.db.query(
      `WITH liberadas AS (
         UPDATE solicitudes
            SET estado = CASE WHEN resultado_general = 'ROJO' THEN 'RECHAZADA_POR_POLITICAS' ELSE 'PENDIENTE_DECISION_CLIENTE' END,
                updated_at = now()
          WHERE estado = 'EN_EVALUACION' AND resultado_visible_at <= now()
          RETURNING cliente_id, estado, producto_nombre
       )
       INSERT INTO notificaciones (cliente_id, tipo, titulo, mensaje, enlace)
       SELECT cliente_id, 'GESTION',
              CASE WHEN estado = 'RECHAZADA_POR_POLITICAS' THEN 'Tu solicitud no fue aprobada' ELSE 'Tu solicitud fue aprobada' END,
              CASE WHEN estado = 'RECHAZADA_POR_POLITICAS'
                   THEN 'La evaluación de ' || COALESCE(producto_nombre, 'tu producto') || ' ya tiene resultado.'
                   ELSE 'La evaluación de ' || COALESCE(producto_nombre, 'tu producto') || ' ya tiene resultado: decide si deseas continuar.' END,
              '/gestiones'
         FROM liberadas`,
    );
  }

  /** Paso 2: el cliente acepta o rechaza el resultado (UPDATE atómico, sin carreras). */
  async decidir(clienteId: string, id: string, aceptar: boolean) {
    await this.liberarResultados();
    const s = await this.db.one<Solicitud>(
      `UPDATE solicitudes
          SET estado = $3, decision_cliente_at = now(), updated_at = now()
        WHERE id = $1 AND cliente_id = $2 AND estado = 'PENDIENTE_DECISION_CLIENTE'
        RETURNING ${SOLICITUD_COLS}`,
      [id, clienteId, aceptar ? 'ACEPTADA' : 'RECHAZADA_POR_CLIENTE'],
    );
    if (s) {
      if (aceptar) await this.enviarACp(s); // mejor esfuerzo: nunca bloquea la aceptación
      return this.toView(s);
    }

    // No se actualizó nada: ¿no existe (o es ajena) o ya no admite decisión?
    const existe = await this.db.one('SELECT 1 FROM solicitudes WHERE id = $1 AND cliente_id = $2', [id, clienteId]);
    if (!existe) throw new NotFoundException('Solicitud no encontrada');
    throw new ConflictException('Esta solicitud ya no admite una decisión');
  }

  /** Registra la gestión aceptada en CP Gestiones; guarda el id que devuelva o el motivo del fallo. */
  private async enviarACp(s: Solicitud) {
    try {
      const cliente = await this.clientes.obtener(s.clienteId);
      const m = await this.db.one<{ monto: string | null }>('SELECT monto_solicitado::text AS monto FROM solicitudes WHERE id = $1', [s.id]).catch(() => null);
      const cpId = await this.cpGestiones.registrarGestion(cliente, { gestionRef: s.id, productoCodigo: s.productoCodigo, monto: m?.monto ? Number(m.monto) : undefined });
      await this.db.query('UPDATE solicitudes SET cp_gestion_id = $2, cp_error = NULL WHERE id = $1', [s.id, cpId]);
    } catch (err: any) {
      const msg = String(err?.response?.message ?? err?.message ?? 'Error desconocido').slice(0, 290);
      this.logger.warn(`No se pudo registrar la gestión ${s.id} en CP Gestiones: ${msg}`);
      await this.db.query('UPDATE solicitudes SET cp_error = $2 WHERE id = $1', [s.id, msg]).catch(() => undefined);
    }
  }

  private reenviando = new Set<string>();

  /** Reenvía a CP las gestiones aceptadas que aún no llegaron (p. ej. CP estaba caído). No bloquea la respuesta. */
  private reintentarPendientesCp(clienteId: string) {
    void (async () => {
      try {
        const rows = await this.db.rows<Solicitud>(
          `SELECT ${SOLICITUD_COLS} FROM solicitudes WHERE cliente_id = $1 AND estado IN ('ACEPTADA', 'EMITIDA') AND cp_gestion_id IS NULL`,
          [clienteId],
        );
        for (const s of rows) {
          if (this.reenviando.has(s.id)) continue;
          this.reenviando.add(s.id);
          try {
            await this.enviarACp(s);
          } finally {
            this.reenviando.delete(s.id);
          }
        }
      } catch {
        /* la columna cp_gestion_id puede no existir todavía: se ignora */
      }
    })();
  }

  private ultimaSync = new Map<string, number>();

  /**
   * Trae de CP Gestiones el avance de las gestiones aceptadas: cuando el banco la completa (emitida) o la cancela,
   * se refleja aquí. Corre en segundo plano (máx. cada 10 s por gestión) y el resultado se ve en la siguiente consulta.
   */
  private sincronizarConCp(clienteId: string) {
    void (async () => {
      try {
        const rows = await this.db.rows<{ id: string; cpId: string; codigo: string; nombre: string | null }>(
          `SELECT id, cp_gestion_id AS "cpId", producto_codigo AS codigo, producto_nombre AS nombre
             FROM solicitudes WHERE cliente_id = $1 AND estado = 'ACEPTADA' AND cp_gestion_id IS NOT NULL`,
          [clienteId],
        );
        for (const r of rows) {
          if (Date.now() - (this.ultimaSync.get(r.id) ?? 0) < 10_000) continue;
          this.ultimaSync.set(r.id, Date.now());
          try {
            await this.sincronizarUna(clienteId, r);
          } catch (err: any) {
            this.logger.warn(`No se pudo consultar la gestión ${r.id} en CP Gestiones: ${err?.message}`);
          }
        }
      } catch {
        /* columnas de CP todavía sin crear: se ignora */
      }
    })();
  }

  private async sincronizarUna(clienteId: string, r: { id: string; cpId: string; codigo: string; nombre: string | null }) {
    const cliente = await this.clientes.obtener(clienteId);
    if (!cliente.dpi) return;
    let cp = await this.cpGestiones.consultar(r.cpId, cliente.dpi);
    if (cp.estado === 'aprobada') {
      // El cliente ya aceptó aquí: se registra la aceptación en CP para que el banco continúe el trámite
      await this.cpGestiones.registrarAceptacion(r.cpId, cliente.dpi, cp.version, r.id);
      cp = await this.cpGestiones.consultar(r.cpId, cliente.dpi);
    }
    await this.db.query('UPDATE solicitudes SET cp_estado = $2 WHERE id = $1', [r.id, cp.estado]).catch(() => undefined);

    const nuevo = cp.estado === 'emitida' ? 'EMITIDA' : cp.estado === 'cancelada' || cp.estado === 'rechazada' ? 'CANCELADA' : null;
    if (!nuevo) return;
    // Datos del crédito leídos ANTES de la transacción (si falta una columna, una consulta fallida abortaría la transacción)
    const dc = nuevo === 'EMITIDA' ? await this.datosCredito(r.id) : null;
    // En una transacción: si es un crédito, el cambio de estado y el alta del préstamo (cuotas + desembolso) van juntos
    const hecho = await this.db.transaction(async (tx) => {
      const s = await this.db.one<Solicitud>(
        `UPDATE solicitudes SET estado = $2, nota_admin = COALESCE(nota_admin, $3), updated_at = now()
          WHERE id = $1 AND estado = 'ACEPTADA' RETURNING ${SOLICITUD_COLS}`,
        [r.id, nuevo, nuevo === 'EMITIDA' ? 'Completada por el banco en CP Gestiones' : 'Cancelada por el banco en CP Gestiones'],
        tx,
      );
      if (!s) return null;
      let prestamo = null;
      if (nuevo === 'EMITIDA' && esCredito(s.productoCodigo)) {
        // Cuotas: las que definió el banco en CP; si no, el plazo que pidió el cliente; si no, el estándar del producto
        const cuotas = cp.plazoMeses ?? dc?.plazo ?? CONDICIONES_CREDITO[s.productoCodigo].plazoDef;
        prestamo = await this.prestamos.otorgar(s, Math.min(cuotas, CONDICIONES_CREDITO[s.productoCodigo].plazoMax), dc?.monto ?? null, tx);
      }
      return { s, prestamo };
    });
    if (!hecho) return;
    const { s } = hecho;
    if (hecho.prestamo?.nuevo) await this.prestamos.avisarOtorgado(hecho.prestamo.prestamo);
    if (nuevo === 'EMITIDA' && s.productoCodigo === 'TARJETA_CREDITO') await this.tarjetas.emitirDesdeSolicitud(s.id);
    await this.notificaciones.crear(
      s.clienteId,
      'GESTION',
      nuevo === 'EMITIDA' ? 'Tu gestión fue completada' : 'Tu gestión fue cancelada',
      `${s.productoNombre ?? 'Tu solicitud'}: ${nuevo === 'EMITIDA' ? 'el banco completó el trámite.' : 'el banco canceló el trámite.'}`,
      '/gestiones',
    );
  }

  async listarDeCliente(clienteId: string) {
    this.sincronizarConCp(clienteId);
    this.reintentarPendientesCp(clienteId);
    await this.liberarResultados();
    const rows = await this.db.rows<Solicitud>(
      `SELECT ${SOLICITUD_COLS} FROM solicitudes WHERE cliente_id = $1 ORDER BY created_at DESC`,
      [clienteId],
    );
    return rows.map((s) => this.toView(s));
  }

  async verDeCliente(clienteId: string, id: string) {
    this.sincronizarConCp(clienteId);
    await this.liberarResultados();
    const s = await this.db.one<Solicitud>(`SELECT ${SOLICITUD_COLS} FROM solicitudes WHERE id = $1 AND cliente_id = $2`, [
      id,
      clienteId,
    ]);
    if (!s) throw new NotFoundException('Solicitud no encontrada');
    return this.toView(s);
  }

  // ---------------------------------------------------------------- administración

  async listarAdmin(f: FiltroSolicitudesDto) {
    await this.liberarResultados();
    const page = f.page ?? 1;
    const limit = f.limit ?? 20;
    const where: string[] = [];
    const params: unknown[] = [];
    if (f.estado) {
      params.push(f.estado);
      where.push(`estado = $${params.length}`);
    }
    if (f.productoCodigo) {
      params.push(f.productoCodigo);
      where.push(`producto_codigo = $${params.length}`);
    }
    const cond = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const rows = await this.db.rows<Solicitud>(
      `SELECT ${SOLICITUD_COLS} FROM solicitudes ${cond}
        ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, (page - 1) * limit],
    );
    const total = (await this.db.one<{ total: number }>(`SELECT count(*)::int AS total FROM solicitudes ${cond}`, params))!
      .total;
    return { items: rows.map((s) => this.toView(s, true)), total, page, limit };
  }

  async verAdmin(id: string) {
    await this.liberarResultados();
    const s = await this.db.one<Solicitud>(`SELECT ${SOLICITUD_COLS} FROM solicitudes WHERE id = $1`, [id]);
    if (!s) throw new NotFoundException('Solicitud no encontrada');
    return { ...this.toView(s, true), sib: s.sib };
  }

  async cambiarEstado(id: string, dto: CambiarEstadoDto) {
    await this.liberarResultados();
    const desde = dto.estado === 'EMITIDA' ? ['ACEPTADA'] : ['ACEPTADA', 'PENDIENTE_DECISION_CLIENTE', 'EN_EVALUACION'];

    // Al aprobar un préstamo el banco DEBE definir el número de cuotas (o ya viene el plazo que pidió el cliente)
    let cuotas: number | undefined;
    let monto: number | null = null;
    if (dto.estado === 'EMITIDA') {
      const cur = await this.db.one<{ productoCodigo: string }>('SELECT producto_codigo AS "productoCodigo" FROM solicitudes WHERE id = $1', [id]);
      if (cur && esCredito(cur.productoCodigo)) {
        const dc = await this.datosCredito(id);
        monto = dc.monto;
        cuotas = dto.cuotas ?? dc.plazo ?? undefined;
        const max = CONDICIONES_CREDITO[cur.productoCodigo].plazoMax;
        if (!cuotas) throw new UnprocessableEntityException('Define el número de cuotas del préstamo (campo "cuotas") para aprobarlo');
        if (cuotas > max) throw new UnprocessableEntityException(`El número de cuotas para este producto no puede superar ${max}`);
      }
    }

    const hecho = await this.db.transaction(async (tx) => {
      const s = await this.db.one<Solicitud>(
        `UPDATE solicitudes
            SET estado = $2, nota_admin = COALESCE($3, nota_admin), updated_at = now()
          WHERE id = $1 AND estado = ANY($4::text[])
          RETURNING ${SOLICITUD_COLS}`,
        [id, dto.estado, dto.nota ?? null, desde],
        tx,
      );
      if (!s) return null;
      const prestamo = cuotas ? await this.prestamos.otorgar(s, cuotas, monto, tx) : null;
      return { s, prestamo };
    });
    if (hecho) {
      const { s } = hecho;
      if (hecho.prestamo?.nuevo) await this.prestamos.avisarOtorgado(hecho.prestamo.prestamo);
      if (dto.estado === 'EMITIDA' && s.productoCodigo === 'TARJETA_CREDITO') await this.tarjetas.emitirDesdeSolicitud(s.id);
      await this.notificaciones.crear(
        s.clienteId,
        'GESTION',
        dto.estado === 'EMITIDA' ? 'Tu gestión fue completada' : 'Tu gestión fue cancelada',
        `${s.productoNombre ?? 'Tu solicitud'}: ${dto.nota?.trim() || (dto.estado === 'EMITIDA' ? 'el banco completó el trámite.' : 'el banco canceló el trámite.')}`,
        '/gestiones',
      );
      return { ...this.toView(s, true), cuotas: hecho.prestamo?.prestamo.cuotasTotal ?? null };
    }

    const actual = await this.db.one<{ estado: string }>('SELECT estado FROM solicitudes WHERE id = $1', [id]);
    if (!actual) throw new NotFoundException('Solicitud no encontrada');
    throw new ConflictException(`No se puede pasar de ${actual.estado} a ${dto.estado}`);
  }

  /** Monto y plazo (meses = cuotas) que pidió el cliente; nulos si no los indicó o si las columnas aún no existen. */
  private async datosCredito(id: string): Promise<{ monto: number | null; plazo: number | null }> {
    const r = await this.db
      .one<{ monto: string | null; plazo: number | null }>('SELECT monto_solicitado::text AS monto, plazo_meses AS plazo FROM solicitudes WHERE id = $1', [id])
      .catch(() => null);
    if (r) return { monto: r.monto ? Number(r.monto) : null, plazo: r.plazo ?? null };
    const m = await this.db.one<{ monto: string | null }>('SELECT monto_solicitado::text AS monto FROM solicitudes WHERE id = $1', [id]).catch(() => null);
    return { monto: m?.monto ? Number(m.monto) : null, plazo: null };
  }

  /** Vuelve a consultar la evaluación al CORE (útil para auditoría desde la app administrativa). */
  async consultarEnCore(id: string) {
    const s = await this.db.one<{ evaluacionId: number }>(
      'SELECT evaluacion_id AS "evaluacionId" FROM solicitudes WHERE id = $1',
      [id],
    );
    if (!s) throw new NotFoundException('Solicitud no encontrada');
    return this.core.obtenerEvaluacion(s.evaluacionId);
  }

  // ---------------------------------------------------------------- helpers

  /** El detalle de políticas es interno: solo lo recibe la app administrativa (conDetalle = true). */
  toView(s: Solicitud, conDetalle = false) {
    const enEspera = s.estado === 'EN_EVALUACION';
    const segundosRestantes = enEspera
      ? Math.max(0, Math.ceil((new Date(s.resultadoVisibleAt).getTime() - Date.now()) / 1000))
      : 0;
    return {
      id: s.id,
      clienteId: s.clienteId,
      productoCodigo: s.productoCodigo,
      productoNombre: s.productoNombre,
      evaluacionId: s.evaluacionId,
      // Mientras dura la espera de demostración el resultado no se revela
      enEvaluacion: enEspera,
      segundosRestantes,
      aprobada: enEspera ? null : s.resultadoGeneral !== 'ROJO',
      resultadoGeneral: enEspera ? null : s.resultadoGeneral,
      resultadoEtiqueta: enEspera ? null : s.resultadoEtiqueta,
      puedeDecidir: s.estado === 'PENDIENTE_DECISION_CLIENTE',
      politicas: enEspera || !conDetalle ? [] : s.politicas.map((p) => ({ nombre: p.Nombre, resultado: p.Resultado, detalle: p.Detalle })),
      estado: s.estado,
      decisionClienteAt: s.decisionClienteAt,
      notaAdmin: s.notaAdmin,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    };
  }
}
