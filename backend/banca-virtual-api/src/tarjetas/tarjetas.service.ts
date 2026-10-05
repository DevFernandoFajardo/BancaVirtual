import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
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
  ) {}

  listar(clienteId: string) {
    return this.db.rows<Tarjeta>(`SELECT ${TARJETA_COLS} FROM tarjetas WHERE cliente_id = $1 ORDER BY created_at`, [clienteId]);
  }

  private async obtener(clienteId: string, id: string): Promise<Tarjeta> {
    const t = await this.db.one<Tarjeta>(`SELECT ${TARJETA_COLS} FROM tarjetas WHERE id = $1 AND cliente_id = $2`, [id, clienteId]);
    if (!t) throw new NotFoundException('Tarjeta no encontrada');
    return t;
  }

  async detalle(clienteId: string, id: string) {
    const tarjeta = await this.obtener(clienteId, id);
    const movimientos = await this.db.rows(
      `SELECT id, tipo, monto::float8 AS monto, descripcion, created_at AS fecha
         FROM tarjeta_movimientos WHERE tarjeta_id = $1 ORDER BY created_at DESC, id DESC LIMIT 50`,
      [id],
    );
    return { ...tarjeta, movimientos };
  }

  async bloquear(clienteId: string, id: string, bloquear: boolean) {
    await this.obtener(clienteId, id);
    await this.db.query(`UPDATE tarjetas SET estado = $2 WHERE id = $1`, [id, bloquear ? 'BLOQUEADA' : 'ACTIVA']);
    const t = await this.obtener(clienteId, id);
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
