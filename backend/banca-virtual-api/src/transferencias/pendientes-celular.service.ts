import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { fromCents, toCents } from '../common/money.util';
import { CUENTA_COLS, Cuenta } from '../cuentas/cuentas.schema';
import { CuentasService } from '../cuentas/cuentas.service';
import { DatabaseService } from '../database/database.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { CrearTransferenciaCelularDto } from './transferencias.schema';
import { TransferenciasService } from './transferencias.service';

interface Pendiente {
  id: string;
  referencia: string;
  clienteId: string;
  cuentaOrigenId: string;
  telefono: string;
  monto: number;
  moneda: string;
  descripcion: string;
}

const COLS_PEND = `id, referencia, cliente_id AS "clienteId", cuenta_origen_id AS "cuentaOrigenId", telefono,
  monto::float8 AS monto, moneda, descripcion`;

const fmtTel = (t: string) => `${t.slice(0, 4)} ${t.slice(4)}`;

/**
 * Envíos por celular a números todavía no registrados: el dinero se debita y queda retenido.
 *  - Cuando alguien registra ese celular (y tiene una cuenta activa) se le acredita solo.
 *  - Si pasan los días de retención (7 por defecto) sin que nadie lo registre, se devuelve al remitente.
 *  - El remitente puede cancelarlo en cualquier momento mientras siga pendiente.
 */
@Injectable()
export class PendientesCelularService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PendientesCelularService.name);
  private timer?: NodeJS.Timeout;
  private ejecutando = false;

  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService,
    private readonly cuentas: CuentasService,
    private readonly transferencias: TransferenciasService,
    private readonly notificaciones: NotificacionesService,
  ) {}

  onModuleInit() {
    const seg = Number(this.config.get('PENDIENTES_INTERVALO_SEGUNDOS') ?? 60);
    if (seg > 0) {
      this.timer = setInterval(() => void this.procesar(), seg * 1000);
      this.timer.unref();
    }
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private get dias() {
    return Math.max(1, Number(this.config.get('PENDIENTE_DIAS_RETENCION') ?? 7));
  }

  /** Envía a un celular: si ya tiene cuenta es una transferencia normal; si no, queda pendiente de reclamar. */
  async enviar(clienteId: string, dto: CrearTransferenciaCelularDto) {
    const destino = await this.cuentas.cuentaDeCelular(dto.telefono);
    if (destino) {
      const c = await this.transferencias.transferir(
        clienteId,
        { cuentaOrigenId: dto.cuentaOrigenId, cuentaDestinoNumero: destino.numero, monto: dto.monto, descripcion: dto.descripcion },
        true,
      );
      return { ...c, pendiente: false as const };
    }

    const max = Number(this.config.get('MAX_TRANSFER_AMOUNT') ?? 50000);
    if (dto.monto > max) throw new UnprocessableEntityException(`El monto máximo por transferencia es Q${max.toFixed(2)}`);

    const propio = await this.db.one('SELECT 1 AS x FROM clientes WHERE id = $1 AND telefono = $2', [clienteId, dto.telefono]);
    if (propio) throw new BadRequestException('Ese es tu propio número de celular');

    const montoCents = toCents(dto.monto);
    const descripcion = dto.descripcion?.trim() || 'Envío por celular';

    return this.db.transaction(async (tx) => {
      const origen = (await this.db.rows<Cuenta>(`SELECT ${CUENTA_COLS} FROM cuentas WHERE id = $1 FOR UPDATE`, [dto.cuentaOrigenId], tx))[0];
      if (!origen || origen.clienteId !== clienteId) throw new NotFoundException('Cuenta origen no encontrada');
      if (origen.estado !== 'ACTIVA') throw new UnprocessableEntityException('La cuenta origen no está activa');
      if (origen.tipo === 'PLAZO_FIJO') throw new UnprocessableEntityException('No se puede transferir desde un plazo fijo: liquídalo primero');
      const saldo = toCents(origen.saldo);
      if (saldo < montoCents) throw new UnprocessableEntityException('Fondos insuficientes');

      const saldoDespues = fromCents(saldo - montoCents);
      const monto = fromCents(montoCents);
      const referencia = 'PEN-' + randomBytes(6).toString('hex').toUpperCase();
      await tx.query('UPDATE cuentas SET saldo = $1 WHERE id = $2', [saldoDespues, origen.id]);
      const p = (await this.db.one<{ id: string; expiraEn: Date; createdAt: Date }>(
        `INSERT INTO transferencias_celular (referencia, cliente_id, cuenta_origen_id, telefono, monto, moneda, descripcion, expira_en)
         VALUES ($1, $2, $3, $4, $5, $6, $7, now() + ($8 || ' days')::interval)
         RETURNING id, expira_en AS "expiraEn", created_at AS "createdAt"`,
        [referencia, clienteId, origen.id, dto.telefono, monto, origen.moneda, descripcion, String(this.dias)],
        tx,
      ))!;
      await tx.query(
        `INSERT INTO movimientos (cuenta_id, tipo, monto, saldo_posterior, descripcion, referencia) VALUES ($1, 'DEBITO', $2, $3, $4, $5)`,
        [origen.id, monto, saldoDespues, `Envío a celular ${fmtTel(dto.telefono)} (pendiente): ${descripcion}`.slice(0, 140), referencia],
      );
      return {
        pendiente: true as const,
        id: p.id,
        referencia,
        estado: 'PENDIENTE',
        monto: Number(monto),
        moneda: origen.moneda,
        descripcion,
        telefono: dto.telefono,
        cuentaOrigen: origen.numero,
        saldoOrigenDespues: Number(saldoDespues),
        expiraEn: p.expiraEn,
        fecha: p.createdAt,
      };
    });
  }

  /** Pendientes (y los resueltos en los últimos 30 días) de un cliente. */
  async listar(clienteId: string) {
    await this.procesar();
    return this.db
      .rows(
        `SELECT p.id, p.referencia, p.telefono, p.monto::float8 AS monto, p.moneda, p.descripcion, p.estado,
                p.expira_en AS "expiraEn", p.resuelta_en AS "resueltaEn", p.created_at AS "createdAt", c.numero AS "cuentaOrigen"
           FROM transferencias_celular p JOIN cuentas c ON c.id = p.cuenta_origen_id
          WHERE p.cliente_id = $1 AND (p.estado = 'PENDIENTE' OR p.resuelta_en > now() - interval '30 days')
          ORDER BY (p.estado = 'PENDIENTE') DESC, p.created_at DESC LIMIT 30`,
        [clienteId],
      )
      .catch(() => []); // si aún no se corrió 11_envios_pendientes_celular.sql
  }

  /** El remitente recupera su dinero mientras nadie haya reclamado el envío. */
  async cancelar(clienteId: string, id: string) {
    const ok = await this.devolver(id, 'CANCELADA', clienteId);
    if (!ok) throw new NotFoundException('Envío pendiente no encontrado (quizá ya fue recibido)');
    return { ok: true };
  }

  /** Acredita los envíos cuyo celular ya tiene cuenta y devuelve los vencidos. Seguro de llamar muchas veces. */
  async procesar() {
    if (this.ejecutando) return;
    this.ejecutando = true;
    try {
      const reclamables = await this.db.rows<{ id: string }>(
        `SELECT p.id FROM transferencias_celular p
          WHERE p.estado = 'PENDIENTE'
            AND EXISTS (SELECT 1 FROM clientes cl JOIN cuentas c ON c.cliente_id = cl.id
                         WHERE cl.telefono = p.telefono AND c.estado = 'ACTIVA' AND c.tipo <> 'PLAZO_FIJO' AND c.moneda = p.moneda
                           AND cl.id <> p.cliente_id)`,
      );
      for (const { id } of reclamables) {
        await this.reclamar(id).catch((e) => this.logger.warn(`No se pudo acreditar el envío ${id}: ${e?.message ?? e}`));
      }
      const vencidos = await this.db.rows<{ id: string }>(`SELECT id FROM transferencias_celular WHERE estado = 'PENDIENTE' AND expira_en <= now()`);
      for (const { id } of vencidos) {
        await this.devolver(id, 'DEVUELTA').catch((e) => this.logger.warn(`No se pudo devolver el envío ${id}: ${e?.message ?? e}`));
      }
    } catch (e: any) {
      if (e?.code !== '42P01') this.logger.warn(`Pendientes por celular: ${e?.message ?? e}`); // 42P01: tabla aún no creada
    } finally {
      this.ejecutando = false;
    }
  }

  private async reclamar(id: string): Promise<boolean> {
    const previo = await this.db.one<Pendiente>(`SELECT ${COLS_PEND} FROM transferencias_celular WHERE id = $1 AND estado = 'PENDIENTE'`, [id]);
    if (!previo) return false;
    const destino = await this.cuentas.cuentaDeCelular(previo.telefono);
    if (!destino || destino.moneda !== previo.moneda || destino.clienteId === previo.clienteId) return false;

    const resultado = await this.db.transaction(async (tx) => {
      const p = await this.db.one<Pendiente>(`SELECT ${COLS_PEND} FROM transferencias_celular WHERE id = $1 AND estado = 'PENDIENTE' FOR UPDATE`, [id], tx);
      if (!p) return null;
      const cuenta = (await this.db.rows<Cuenta>(`SELECT ${CUENTA_COLS} FROM cuentas WHERE id = $1 FOR UPDATE`, [destino.id], tx))[0];
      if (!cuenta || cuenta.estado !== 'ACTIVA') return null;

      const monto = fromCents(toCents(p.monto));
      const saldoDespues = fromCents(toCents(cuenta.saldo) + toCents(p.monto));
      await tx.query('UPDATE cuentas SET saldo = $1 WHERE id = $2', [saldoDespues, cuenta.id]);
      await tx.query(
        `INSERT INTO transferencias (referencia, cuenta_origen_id, cuenta_destino_id, monto, moneda, descripcion) VALUES ($1, $2, $3, $4, $5, $6)`,
        [p.referencia, p.cuentaOrigenId, cuenta.id, monto, p.moneda, p.descripcion],
      );
      await tx.query(
        `INSERT INTO movimientos (cuenta_id, tipo, monto, saldo_posterior, descripcion, referencia) VALUES ($1, 'CREDITO', $2, $3, $4, $5)`,
        [cuenta.id, monto, saldoDespues, `Transferencia recibida por celular: ${p.descripcion}`.slice(0, 140), p.referencia],
      );
      await tx.query(`UPDATE transferencias_celular SET estado = 'RECLAMADA', resuelta_en = now() WHERE id = $1`, [p.id]);
      return { p, cuentaNumero: cuenta.numero, clienteDestino: cuenta.clienteId };
    });
    if (!resultado) return false;

    const { p, cuentaNumero, clienteDestino } = resultado;
    await this.notificaciones.crear(
      clienteDestino,
      'MOVIMIENTO',
      'Transferencia móvil',
      `Recibiste Q${p.monto.toFixed(2)}. Ref. ${p.referencia}.`,
      '/transferencias',
    );
    await this.notificaciones.crear(
      p.clienteId,
      'MOVIMIENTO',
      'Tu envío por celular fue recibido',
      `El celular ${fmtTel(p.telefono)} ya se registró y recibió Q${p.monto.toFixed(2)}. Ref. ${p.referencia}.`,
      '/transferencias',
    );
    return true;
  }

  /** Devuelve el dinero al remitente (vencido o cancelado). `clienteId` restringe a un remitente concreto. */
  private async devolver(id: string, estado: 'DEVUELTA' | 'CANCELADA', clienteId?: string): Promise<boolean> {
    const resultado = await this.db.transaction(async (tx) => {
      const p = await this.db.one<Pendiente>(
        `SELECT ${COLS_PEND} FROM transferencias_celular WHERE id = $1 AND estado = 'PENDIENTE' AND ($2::uuid IS NULL OR cliente_id = $2) FOR UPDATE`,
        [id, clienteId ?? null],
        tx,
      );
      if (!p) return null;
      const origen = (await this.db.rows<Cuenta>(`SELECT ${CUENTA_COLS} FROM cuentas WHERE id = $1 FOR UPDATE`, [p.cuentaOrigenId], tx))[0];
      if (!origen) return null;
      const monto = fromCents(toCents(p.monto));
      const saldoDespues = fromCents(toCents(origen.saldo) + toCents(p.monto));
      await tx.query('UPDATE cuentas SET saldo = $1 WHERE id = $2', [saldoDespues, origen.id]);
      await tx.query(
        `INSERT INTO movimientos (cuenta_id, tipo, monto, saldo_posterior, descripcion, referencia) VALUES ($1, 'CREDITO', $2, $3, $4, $5)`,
        [
          origen.id,
          monto,
          saldoDespues,
          `${estado === 'CANCELADA' ? 'Cancelación' : 'Devolución'} de envío a celular ${fmtTel(p.telefono)}`.slice(0, 140),
          p.referencia,
        ],
      );
      await tx.query(`UPDATE transferencias_celular SET estado = $2, resuelta_en = now() WHERE id = $1`, [p.id, estado]);
      return p;
    });
    if (!resultado) return false;
    if (estado === 'DEVUELTA') {
      await this.notificaciones.crear(
        resultado.clienteId,
        'MOVIMIENTO',
        'Envío por celular devuelto',
        `Nadie registró el celular ${fmtTel(resultado.telefono)} a tiempo. Te devolvimos Q${resultado.monto.toFixed(2)}. Ref. ${resultado.referencia}.`,
        '/transferencias',
      );
    }
    return true;
  }
}
