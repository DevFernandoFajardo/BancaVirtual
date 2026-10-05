import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CoreClient } from '../core/core.client';
import { CoreEvaluacionRequest } from '../core/core.types';
import { DatabaseService, PG_UNIQUE_VIOLATION } from '../database/database.service';
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
  constructor(
    private readonly db: DatabaseService,
    private readonly core: CoreClient,
    private readonly notificaciones: NotificacionesService,
    private readonly tarjetas: TarjetasService,
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
    if (s) return this.toView(s);

    // No se actualizó nada: ¿no existe (o es ajena) o ya no admite decisión?
    const existe = await this.db.one('SELECT 1 FROM solicitudes WHERE id = $1 AND cliente_id = $2', [id, clienteId]);
    if (!existe) throw new NotFoundException('Solicitud no encontrada');
    throw new ConflictException('Esta solicitud ya no admite una decisión');
  }

  async listarDeCliente(clienteId: string) {
    await this.liberarResultados();
    const rows = await this.db.rows<Solicitud>(
      `SELECT ${SOLICITUD_COLS} FROM solicitudes WHERE cliente_id = $1 ORDER BY created_at DESC`,
      [clienteId],
    );
    return rows.map((s) => this.toView(s));
  }

  async verDeCliente(clienteId: string, id: string) {
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
    const s = await this.db.one<Solicitud>(
      `UPDATE solicitudes
          SET estado = $2, nota_admin = COALESCE($3, nota_admin), updated_at = now()
        WHERE id = $1 AND estado = ANY($4::text[])
        RETURNING ${SOLICITUD_COLS}`,
      [id, dto.estado, dto.nota ?? null, desde],
    );
    if (s) {
      if (dto.estado === 'EMITIDA' && s.productoCodigo === 'TARJETA_CREDITO') await this.tarjetas.emitirDesdeSolicitud(s.id);
      await this.notificaciones.crear(
        s.clienteId,
        'GESTION',
        dto.estado === 'EMITIDA' ? 'Tu gestión fue completada' : 'Tu gestión fue cancelada',
        `${s.productoNombre ?? 'Tu solicitud'}: ${dto.nota?.trim() || (dto.estado === 'EMITIDA' ? 'el banco completó el trámite.' : 'el banco canceló el trámite.')}`,
        '/gestiones',
      );
      return this.toView(s, true);
    }

    const actual = await this.db.one<{ estado: string }>('SELECT estado FROM solicitudes WHERE id = $1', [id]);
    if (!actual) throw new NotFoundException('Solicitud no encontrada');
    throw new ConflictException(`No se puede pasar de ${actual.estado} a ${dto.estado}`);
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
