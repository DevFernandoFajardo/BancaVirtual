import {
  Logger,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { ClientesService } from '../clientes/clientes.service';
import { CpClient } from '../cp/cp.client';
import { fromCents, toCents } from '../common/money.util';
import { CUENTA_COLS, Cuenta } from '../cuentas/cuentas.schema';
import { DatabaseService } from '../database/database.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { TARJETA_COLS, Tarjeta } from './tarjetas.schema';

@Injectable()
export class TarjetasService {
  constructor(
    private readonly db: DatabaseService,
    private readonly notificaciones: NotificacionesService,
    private readonly config: ConfigService,
    private readonly cp: CpClient,
    private readonly clientes: ClientesService,
  ) {}

  private readonly logger = new Logger(TarjetasService.name);
  private ultimaSync = new Map<string, number>();

  /**
   * Las tarjetas emitidas por el banco viven en CP Gestiones: si el personal la bloquea, cambia el límite o hay saldo,
   * se refleja aquí. Se vincula por la gestión (solicitud) que la originó. Mejor esfuerzo: si CP no responde, se muestra lo local.
   */
  private async sincronizarConCp(clienteId: string) {
    if (Date.now() - (this.ultimaSync.get(clienteId) ?? 0) < 8_000) return;
    this.ultimaSync.set(clienteId, Date.now());
    try {
      const rows = await this.db.rows<{ id: string; cpId: string | null; gestionId: string | null }>(
        `SELECT t.id, t.cp_tarjeta_id AS "cpId", s.cp_gestion_id AS "gestionId"
           FROM tarjetas t LEFT JOIN solicitudes s ON s.id = t.solicitud_id WHERE t.cliente_id = $1`,
        [clienteId],
      );
      if (!rows.length) return;
      const cliente = await this.clientes.obtener(clienteId);
      if (!cliente.dpi) return;

      // 1) Vincular con la tarjeta de CP: la gestión emitida trae el id de la tarjeta
      for (const r of rows) {
        if (r.cpId || !r.gestionId) continue;
        const g = await this.cp.get<any>(`/solicitudes/${encodeURIComponent(r.gestionId)}`, { params: { dpi: cliente.dpi } });
        const sol = g?.solicitud ?? g;
        if (sol?.tarjeta_id) {
          r.cpId = String(sol.tarjeta_id);
          await this.db.query('UPDATE tarjetas SET cp_tarjeta_id = $2 WHERE id = $1', [r.id, r.cpId]);
        }
      }
      const vinculadas = rows.filter((r) => r.cpId);
      if (!vinculadas.length) return;

      // 2) Traer el estado real de las tarjetas de CP y reflejarlo
      const lista = await this.cp.get<any>('/tarjetas', { params: { dpi: cliente.dpi } });
      const tarjetasCp: any[] = Array.isArray(lista?.data) ? lista.data : Array.isArray(lista) ? lista : [];
      for (const r of vinculadas) {
        const c = tarjetasCp.find((x) => [x.id, x._id, x.tarjeta_id, x.referencia].some((v) => v !== undefined && String(v) === r.cpId));
        if (!c) continue;
        const estado = String(c.estado ?? 'activa').toLowerCase().startsWith('activ') ? 'ACTIVA' : 'BLOQUEADA';
        const limite = c.limite_centavos !== undefined ? Number(c.limite_centavos) / 100 : null;
        const usado = c.principal_centavos !== undefined ? (Number(c.principal_centavos) + Number(c.interes_centavos ?? 0)) / 100 : null;
        const antes = await this.db.one<{ estado: string }>('SELECT estado FROM tarjetas WHERE id = $1', [r.id]);
        const [previa] = antes ? await this.conOrigen([{ id: r.id, estado: antes.estado }]) : [null];
        // El bloqueo que puso el cliente aquí se respeta aunque CP aún no lo muestre
        if (previa?.bloqueadaPor === 'CLIENTE' && estado === 'ACTIVA') continue;
        await this.db.query(
          `UPDATE tarjetas SET estado = $2, ultimos4 = COALESCE($3, ultimos4),
                  limite = COALESCE($4::numeric, limite), saldo_utilizado = COALESCE($5::numeric, saldo_utilizado)
            WHERE id = $1`,
          [r.id, estado, c.ultimos_cuatro ? String(c.ultimos_cuatro) : null, limite, usado],
        );
        // Bloqueo que viene del banco: el cliente no puede deshacerlo. Si el banco la activa, se libera.
        if (estado === 'BLOQUEADA' && previa?.bloqueadaPor !== 'CLIENTE') {
          await this.db.query("UPDATE tarjetas SET bloqueo_origen = 'BANCO' WHERE id = $1", [r.id]);
        } else if (estado === 'ACTIVA') {
          await this.db.query('UPDATE tarjetas SET bloqueo_origen = NULL WHERE id = $1', [r.id]);
        }
        if (antes && antes.estado !== estado) {
          await this.notificaciones.crear(
            clienteId,
            'TARJETA',
            estado === 'BLOQUEADA' ? 'Tu tarjeta fue bloqueada' : 'Tu tarjeta fue activada',
            `El banco ${estado === 'BLOQUEADA' ? 'bloqueó' : 'activó'} tu tarjeta${c.ultimos_cuatro ? ` terminada en ${c.ultimos_cuatro}` : ''}.`,
            '/tarjetas',
          );
        }
      }
    } catch (err: any) {
      // incluye "columna cp_tarjeta_id inexistente" si aún no se corrió 04_cp_gestiones.sql
      this.logger.warn(`No se pudo sincronizar tarjetas con CP Gestiones: ${err?.message}`);
    }
  }

  /** Quién bloqueó la tarjeta: 'CLIENTE' (puede desbloquearla) o 'BANCO' (solo el banco). Columna de 04_cp_gestiones.sql. */
  private async origenes(ids: string[]): Promise<Map<string, string | null>> {
    const m = new Map<string, string | null>();
    if (!ids.length) return m;
    try {
      const rows = await this.db.rows<{ id: string; o: string | null }>('SELECT id, bloqueo_origen AS o FROM tarjetas WHERE id = ANY($1::uuid[])', [ids]);
      rows.forEach((r) => m.set(r.id, r.o));
    } catch {
      /* columna aún sin crear */
    }
    return m;
  }

  private async conOrigen<T extends { id: string; estado: string }>(rows: T[]): Promise<(T & { bloqueadaPor: string | null })[]> {
    const o = await this.origenes(rows.map((r) => r.id));
    return rows.map((r) => ({ ...r, bloqueadaPor: r.estado === 'BLOQUEADA' ? (o.get(r.id) ?? 'CLIENTE') : null }));
  }

  /** Espera la sincronización como máximo unos segundos para no trabar la pantalla si CP está dormido. */
  private async sincronizarRapido(clienteId: string) {
    await Promise.race([this.sincronizarConCp(clienteId), new Promise((r) => setTimeout(r, 4000))]);
  }

  async listar(clienteId: string) {
    await this.sincronizarRapido(clienteId);
    return this.conOrigen(await this.db.rows<Tarjeta>(`SELECT ${TARJETA_COLS} FROM tarjetas WHERE cliente_id = $1 ORDER BY created_at`, [clienteId]));
  }

  private async obtener(clienteId: string, id: string): Promise<Tarjeta> {
    const t = await this.db.one<Tarjeta>(`SELECT ${TARJETA_COLS} FROM tarjetas WHERE id = $1 AND cliente_id = $2`, [id, clienteId]);
    if (!t) throw new NotFoundException('Tarjeta no encontrada');
    return t;
  }

  async detalle(clienteId: string, id: string) {
    await this.sincronizarRapido(clienteId);
    const tarjeta = await this.obtener(clienteId, id);
    const movimientos = await this.db.rows(
      `SELECT id, tipo, monto::float8 AS monto, descripcion, created_at AS fecha
         FROM tarjeta_movimientos WHERE tarjeta_id = $1 ORDER BY created_at DESC, id DESC LIMIT 50`,
      [id],
    );
    const [conO] = await this.conOrigen([tarjeta]);
    return { ...conO, movimientos };
  }

  /** Si la tarjeta también existe en CP Gestiones, el bloqueo hecho aquí se aplica allá (mejor esfuerzo). */
  private async empujarEstadoACp(clienteId: string, id: string, bloquear: boolean) {
    try {
      const r = await this.db.one<{ cpId: string | null }>('SELECT cp_tarjeta_id AS "cpId" FROM tarjetas WHERE id = $1', [id]);
      if (!r?.cpId) return;
      const cliente = await this.clientes.obtener(clienteId);
      if (!cliente.dpi) return;
      await this.cp.patch(`/tarjetas/${encodeURIComponent(r.cpId)}/estado`, {
        dpi: cliente.dpi,
        estado: bloquear ? 'bloqueada' : 'activa',
        nota: bloquear ? 'Bloqueo solicitado por el cliente en CP BancaVirtual' : 'Desbloqueo solicitado por el cliente en CP BancaVirtual',
      });
    } catch (err: any) {
      this.logger.warn(`No se pudo aplicar el estado de la tarjeta en CP Gestiones: ${err?.message}`);
    }
  }

  async bloquear(clienteId: string, id: string, bloquear: boolean) {
    const actual = await this.obtener(clienteId, id);
    if (!bloquear && actual.estado === 'BLOQUEADA') {
      const [o] = await this.conOrigen([actual]);
      if (o.bloqueadaPor === 'BANCO') {
        throw new ForbiddenException('El banco bloqueó esta tarjeta. Solo el banco puede desbloquearla: comunícate con tu agencia.');
      }
    }
    await this.db.query(`UPDATE tarjetas SET estado = $2 WHERE id = $1`, [id, bloquear ? 'BLOQUEADA' : 'ACTIVA']);
    await this.db.query('UPDATE tarjetas SET bloqueo_origen = $2 WHERE id = $1', [id, bloquear ? 'CLIENTE' : null]).catch(() => undefined);
    const t = await this.obtener(clienteId, id);
    await this.empujarEstadoACp(clienteId, id, bloquear);
    await this.notificaciones.crear(
      clienteId,
      'TARJETA',
      bloquear ? 'Tarjeta bloqueada' : 'Tarjeta desbloqueada',
      `Tu tarjeta terminada en ${t.ultimos4} fue ${bloquear ? 'bloqueada' : 'desbloqueada'}.`,
      '/tarjetas',
    );
    return t;
  }

  /** Paga la tarjeta con dinero de una cuenta del cliente. */
  async pagar(clienteId: string, id: string, cuentaId: string, monto: number) {
    const montoCents = toCents(monto);
    const r = await this.db.transaction(async (tx) => {
      const t = await this.db.one<Tarjeta>(
        `SELECT ${TARJETA_COLS} FROM tarjetas WHERE id = $1 AND cliente_id = $2 FOR UPDATE`,
        [id, clienteId],
        tx,
      );
      if (!t) throw new NotFoundException('Tarjeta no encontrada');
      if (montoCents > toCents(t.saldoUtilizado)) {
        throw new UnprocessableEntityException(`El monto supera tu saldo a pagar (Q${t.saldoUtilizado.toFixed(2)})`);
      }
      const cuenta = await this.db.one<Cuenta>(`SELECT ${CUENTA_COLS} FROM cuentas WHERE id = $1 FOR UPDATE`, [cuentaId], tx);
      if (!cuenta || cuenta.clienteId !== clienteId) throw new NotFoundException('Cuenta no encontrada');
      if (cuenta.estado !== 'ACTIVA' || cuenta.tipo === 'PLAZO_FIJO') {
        throw new UnprocessableEntityException('Elige una cuenta monetaria o de ahorro activa');
      }
      const saldo = toCents(cuenta.saldo);
      if (saldo < montoCents) throw new UnprocessableEntityException('Fondos insuficientes en la cuenta');

      const nuevoSaldo = fromCents(saldo - montoCents);
      const referencia = 'TDC-' + randomBytes(6).toString('hex').toUpperCase();
      await tx.query('UPDATE cuentas SET saldo = $1 WHERE id = $2', [nuevoSaldo, cuenta.id]);
      await tx.query('UPDATE tarjetas SET saldo_utilizado = saldo_utilizado - $1 WHERE id = $2', [fromCents(montoCents), t.id]);
      await tx.query(
        `INSERT INTO movimientos (cuenta_id, tipo, monto, saldo_posterior, descripcion, referencia)
         VALUES ($1, 'DEBITO', $2, $3, $4, $5)`,
        [cuenta.id, fromCents(montoCents), nuevoSaldo, `Pago de tarjeta terminada en ${t.ultimos4}`, referencia],
      );
      await tx.query(
        `INSERT INTO tarjeta_movimientos (tarjeta_id, tipo, monto, descripcion) VALUES ($1, 'PAGO', $2, $3)`,
        [t.id, fromCents(montoCents), `Pago desde cuenta ${cuenta.numero}`],
      );
      return { referencia, ultimos4: t.ultimos4, cuentaOrigen: cuenta.numero, saldoCuentaDespues: Number(nuevoSaldo) };
    });
    await this.notificaciones.crear(
      clienteId,
      'TARJETA',
      'Pago de tarjeta aplicado',
      `Se aplicaron Q${monto.toFixed(2)} a tu tarjeta terminada en ${r.ultimos4}. Ref. ${r.referencia}.`,
      '/tarjetas',
    );
    return { ...r, monto };
  }

  /** Solo demostración: simula una compra con la tarjeta para poder probar el pago. */
  async consumoDemo(clienteId: string, id: string, monto: number, comercio?: string) {
    if (this.config.get('ALLOW_DEMO_DEPOSITS') !== 'true') {
      throw new ForbiddenException('Las compras de demostración están deshabilitadas');
    }
    const montoCents = toCents(monto);
    await this.db.transaction(async (tx) => {
      const t = await this.db.one<Tarjeta>(
        `SELECT ${TARJETA_COLS} FROM tarjetas WHERE id = $1 AND cliente_id = $2 FOR UPDATE`,
        [id, clienteId],
        tx,
      );
      if (!t) throw new NotFoundException('Tarjeta no encontrada');
      if (t.estado !== 'ACTIVA') throw new ConflictException('La tarjeta está bloqueada');
      if (montoCents > toCents(t.disponible)) throw new UnprocessableEntityException('La compra supera tu crédito disponible');
      await tx.query('UPDATE tarjetas SET saldo_utilizado = saldo_utilizado + $1 WHERE id = $2', [fromCents(montoCents), t.id]);
      await tx.query(
        `INSERT INTO tarjeta_movimientos (tarjeta_id, tipo, monto, descripcion) VALUES ($1, 'CONSUMO', $2, $3)`,
        [t.id, fromCents(montoCents), `Compra: ${comercio?.trim() || 'Comercio de demostración'}`],
      );
    });
    return this.detalle(clienteId, id);
  }

  /** Se llama cuando la app administrativa marca como EMITIDA una solicitud de tarjeta de crédito. */
  async emitirDesdeSolicitud(solicitudId: string): Promise<void> {
    const s = await this.db.one<{
      clienteId: string; productoNombre: string | null; nombre: string; apellido: string; ingresos: string;
    }>(
      `SELECT s.cliente_id AS "clienteId", s.producto_nombre AS "productoNombre",
              c.primer_nombre AS nombre, c.primer_apellido AS apellido, c.ingresos_mensuales::text AS ingresos
         FROM solicitudes s JOIN clientes c ON c.id = s.cliente_id WHERE s.id = $1`,
      [solicitudId],
    );
    if (!s) return;
    const limite = Math.min(150_000, Math.max(2_000, Math.round((Number(s.ingresos) * 3) / 100) * 100));
    const ultimos4 = String(Math.floor(Math.random() * 10_000)).padStart(4, '0');
    const r = await this.db.query(
      `INSERT INTO tarjetas (cliente_id, solicitud_id, producto_nombre, ultimos4, titular, vencimiento, limite)
       VALUES ($1, $2, $3, $4, $5, to_char(now() + interval '4 years', 'MM/YY'), $6)
       ON CONFLICT (solicitud_id) DO NOTHING`,
      [s.clienteId, solicitudId, s.productoNombre ?? 'Tarjeta de Crédito', ultimos4, `${s.nombre} ${s.apellido}`.toUpperCase(), limite.toFixed(2)],
    );
    if (r.rowCount) {
      await this.notificaciones.crear(
        s.clienteId,
        'TARJETA',
        '¡Tu tarjeta está lista!',
        `Tu ${s.productoNombre ?? 'tarjeta de crédito'} fue emitida con un límite de Q${limite.toLocaleString('es-GT')}.`,
        '/tarjetas',
      );
    }
  }
}
