import { Injectable, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { randomBytes, randomInt } from 'crypto';
import { fromCents, toCents } from '../common/money.util';
import { CUENTA_COLS, Cuenta } from '../cuentas/cuentas.schema';
import { DatabaseService, Queryable } from '../database/database.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { CONDICIONES_CREDITO, PagarPrestamoDto } from './prestamos.schema';

export interface CuotaPlan {
  numero: number;
  vence: string;
  capital: number; // centavos
  interes: number; // centavos
  total: number; // centavos
}

/** Sistema francés (cuota fija) en centavos enteros; la última cuota absorbe el redondeo. */
export function planDeCuotas(montoCents: number, tasaAnual: number, cuotas: number, desde = new Date()): CuotaPlan[] {
  const i = tasaAnual / 100 / 12;
  const fija = i === 0 ? Math.round(montoCents / cuotas) : Math.round((montoCents * i) / (1 - Math.pow(1 + i, -cuotas)));
  const plan: CuotaPlan[] = [];
  let saldo = montoCents;
  for (let n = 1; n <= cuotas; n++) {
    const interes = Math.round(saldo * i);
    const capital = n === cuotas ? saldo : Math.min(saldo, fija - interes);
    saldo -= capital;
    plan.push({ numero: n, vence: sumarMeses(desde, n), capital, interes, total: capital + interes });
  }
  return plan;
}

/** Fecha de vencimiento: mismo día del mes (tope 28 para evitar meses cortos), en formato YYYY-MM-DD. */
function sumarMeses(base: Date, meses: number): string {
  const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + meses, Math.min(base.getUTCDate(), 28)));
  return d.toISOString().slice(0, 10);
}

interface PrestamoRow {
  id: string;
  clienteId: string;
  solicitudId: string | null;
  productoCodigo: string;
  productoNombre: string;
  numero: string;
  monto: string;
  tasaAnual: string;
  cuotasTotal: number;
  cuotaMonto: string;
  saldoCapital: string;
  estado: 'VIGENTE' | 'LIQUIDADO';
  createdAt: Date;
}

const PRESTAMO_COLS = `id, cliente_id AS "clienteId", solicitud_id AS "solicitudId", producto_codigo AS "productoCodigo",
  producto_nombre AS "productoNombre", numero, monto::text AS monto, tasa_anual::text AS "tasaAnual",
  cuotas_total AS "cuotasTotal", cuota_monto::text AS "cuotaMonto", saldo_capital::text AS "saldoCapital", estado,
  created_at AS "createdAt"`;

@Injectable()
export class PrestamosService {
  private readonly logger = new Logger(PrestamosService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly notificaciones: NotificacionesService,
  ) {}

  /**
   * Otorga el préstamo de una gestión de crédito completada: genera las cuotas y deposita el monto en la cuenta del cliente.
   * Debe ejecutarse dentro de una transacción (`q`). Es idempotente: si la solicitud ya tiene préstamo, lo devuelve.
   * Después del COMMIT hay que llamar a `avisarOtorgado`.
   */
  async otorgar(
    s: { id: string; clienteId: string; productoCodigo: string; productoNombre: string | null },
    cuotas: number,
    montoSolicitado: number | null,
    q: Queryable,
  ): Promise<{ prestamo: PrestamoRow; nuevo: boolean }> {
    const cond = CONDICIONES_CREDITO[s.productoCodigo];
    if (!cond) throw new UnprocessableEntityException('Este producto no es un préstamo');
    if (!Number.isInteger(cuotas) || cuotas < 1 || cuotas > cond.plazoMax) {
      throw new UnprocessableEntityException(`El número de cuotas debe estar entre 1 y ${cond.plazoMax}`);
    }

    const previo = await this.db.one<PrestamoRow>(`SELECT ${PRESTAMO_COLS} FROM prestamos WHERE solicitud_id = $1`, [s.id], q);
    if (previo) return { prestamo: previo, nuevo: false };

    const montoCents = toCents(montoSolicitado && montoSolicitado > 0 ? montoSolicitado : cond.montoDef);

    const plan = planDeCuotas(montoCents, cond.tasa, cuotas);
    const numero = 'PR' + String(randomInt(0, 1e10)).padStart(10, '0');
    const prestamo = (await this.db.one<PrestamoRow>(
      `INSERT INTO prestamos (cliente_id, solicitud_id, producto_codigo, producto_nombre, numero, monto, tasa_anual, cuotas_total, cuota_monto, saldo_capital)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $6) RETURNING ${PRESTAMO_COLS}`,
      [s.clienteId, s.id, s.productoCodigo, s.productoNombre ?? s.productoCodigo, numero, fromCents(montoCents), cond.tasa, cuotas, fromCents(plan[0].total)],
      q,
    ))!;
    for (const c of plan) {
      await q.query(
        `INSERT INTO prestamo_cuotas (prestamo_id, numero, vence, capital, interes, total) VALUES ($1, $2, $3, $4, $5, $6)`,
        [prestamo.id, c.numero, c.vence, fromCents(c.capital), fromCents(c.interes), fromCents(c.total)],
      );
    }

    // Desembolso: se acredita en la cuenta de ahorro (o monetaria) activa más antigua del cliente
    const cuenta = await this.db.one<Cuenta>(
      `SELECT ${CUENTA_COLS} FROM cuentas
        WHERE cliente_id = $1 AND estado = 'ACTIVA' AND tipo IN ('AHORRO', 'MONETARIA')
        ORDER BY (tipo = 'AHORRO') DESC, created_at ASC LIMIT 1 FOR UPDATE`,
      [s.clienteId],
      q,
    );
    if (cuenta) {
      const nuevoSaldo = fromCents(toCents(cuenta.saldo) + montoCents);
      await q.query('UPDATE cuentas SET saldo = $1 WHERE id = $2', [nuevoSaldo, cuenta.id]);
      await q.query(
        `INSERT INTO movimientos (cuenta_id, tipo, monto, saldo_posterior, descripcion, referencia) VALUES ($1, 'CREDITO', $2, $3, $4, $5)`,
        [cuenta.id, fromCents(montoCents), nuevoSaldo, `Desembolso de préstamo ${numero}`, 'DES-' + randomBytes(6).toString('hex').toUpperCase()],
      );
      await q.query('UPDATE prestamos SET cuenta_desembolso_id = $1 WHERE id = $2', [cuenta.id, prestamo.id]);
    }
    return { prestamo, nuevo: true };
  }

  async avisarOtorgado(p: PrestamoRow) {
    await this.notificaciones.crear(
      p.clienteId,
      'GESTION',
      'Tu préstamo fue aprobado',
      `${p.productoNombre}: Q${Number(p.monto).toFixed(2)} a ${p.cuotasTotal} cuotas de Q${Number(p.cuotaMonto).toFixed(2)}. Ya puedes pagarlas desde Préstamos.`,
      '/prestamos',
    );
  }

  // ---------------------------------------------------------------- consultas

  async listar(clienteId: string) {
    const rows = await this.db.rows<PrestamoRow & { pagadas: number; proxNumero: number | null; proxVence: string | null; proxTotal: string | null }>(
      `SELECT ${PRESTAMO_COLS},
              (SELECT count(*)::int FROM prestamo_cuotas c WHERE c.prestamo_id = p.id AND c.estado = 'PAGADA') AS pagadas,
              (SELECT numero FROM prestamo_cuotas c WHERE c.prestamo_id = p.id AND c.estado = 'PENDIENTE' ORDER BY numero LIMIT 1) AS "proxNumero",
              (SELECT vence::text FROM prestamo_cuotas c WHERE c.prestamo_id = p.id AND c.estado = 'PENDIENTE' ORDER BY numero LIMIT 1) AS "proxVence",
              (SELECT total::text FROM prestamo_cuotas c WHERE c.prestamo_id = p.id AND c.estado = 'PENDIENTE' ORDER BY numero LIMIT 1) AS "proxTotal"
         FROM prestamos p WHERE p.cliente_id = $1 ORDER BY p.created_at DESC`,
      [clienteId],
    );
    return rows.map((r) => this.vista(r, r.pagadas, r.proxNumero ? { numero: r.proxNumero, vence: r.proxVence!, total: Number(r.proxTotal) } : null));
  }

  async detalle(clienteId: string, id: string) {
    const p = await this.db.one<PrestamoRow>(`SELECT ${PRESTAMO_COLS} FROM prestamos WHERE id = $1 AND cliente_id = $2`, [id, clienteId]);
    if (!p) throw new NotFoundException('Préstamo no encontrado');
    const cuotas = await this.db.rows<{ numero: number; vence: string; capital: number; interes: number; total: number; estado: string; pagadaAt: Date | null }>(
      `SELECT numero, vence::text AS vence, capital::float8 AS capital, interes::float8 AS interes, total::float8 AS total, estado, pagada_at AS "pagadaAt"
         FROM prestamo_cuotas WHERE prestamo_id = $1 ORDER BY numero`,
      [id],
    );
    const pagadas = cuotas.filter((c) => c.estado === 'PAGADA').length;
    const prox = cuotas.find((c) => c.estado === 'PENDIENTE');
    return { ...this.vista(p, pagadas, prox ? { numero: prox.numero, vence: prox.vence, total: prox.total } : null), cuotas };
  }

  private vista(p: PrestamoRow, pagadas: number, proxima: { numero: number; vence: string; total: number } | null) {
    return {
      id: p.id,
      numero: p.numero,
      productoCodigo: p.productoCodigo,
      productoNombre: p.productoNombre,
      monto: Number(p.monto),
      tasaAnual: Number(p.tasaAnual),
      cuotasTotal: p.cuotasTotal,
      cuotasPagadas: pagadas,
      cuotasPendientes: p.cuotasTotal - pagadas,
      cuotaMonto: Number(p.cuotaMonto),
      saldoCapital: Number(p.saldoCapital),
      estado: p.estado,
      proximaCuota: proxima,
      createdAt: p.createdAt,
    };
  }

  // ---------------------------------------------------------------- pago de cuotas

  /** Paga las próximas `dto.cuotas` cuotas pendientes (en orden) debitando la cuenta elegida. Todo en una transacción. */
  async pagar(clienteId: string, id: string, dto: PagarPrestamoDto) {
    const referencia = 'PGP-' + randomBytes(6).toString('hex').toUpperCase();
    const r = await this.db.transaction(async (tx) => {
      const p = await this.db.one<PrestamoRow>(`SELECT ${PRESTAMO_COLS} FROM prestamos WHERE id = $1 AND cliente_id = $2 FOR UPDATE`, [id, clienteId], tx);
      if (!p) throw new NotFoundException('Préstamo no encontrado');
      if (p.estado === 'LIQUIDADO') throw new UnprocessableEntityException('Este préstamo ya está liquidado');

      const pendientes = await this.db.rows<{ numero: number; capital: string; total: string }>(
        `SELECT numero, capital::text AS capital, total::text AS total FROM prestamo_cuotas
          WHERE prestamo_id = $1 AND estado = 'PENDIENTE' ORDER BY numero LIMIT $2`,
        [id, dto.cuotas],
        tx,
      );
      if (pendientes.length < dto.cuotas) {
        const faltan = (await this.db.one<{ n: number }>("SELECT count(*)::int AS n FROM prestamo_cuotas WHERE prestamo_id = $1 AND estado = 'PENDIENTE'", [id], tx))!.n;
        throw new UnprocessableEntityException(`Solo quedan ${faltan} cuota(s) pendiente(s)`);
      }
      const totalCents = pendientes.reduce((a, c) => a + toCents(c.total), 0);
      const capitalCents = pendientes.reduce((a, c) => a + toCents(c.capital), 0);

      const cuenta = await this.db.one<Cuenta>(`SELECT ${CUENTA_COLS} FROM cuentas WHERE id = $1 FOR UPDATE`, [dto.cuentaId], tx);
      if (!cuenta || cuenta.clienteId !== clienteId) throw new NotFoundException('Cuenta no encontrada');
      if (cuenta.estado !== 'ACTIVA' || cuenta.tipo === 'PLAZO_FIJO') throw new UnprocessableEntityException('Elige una cuenta monetaria o de ahorro activa');
      const saldo = toCents(cuenta.saldo);
      if (saldo < totalCents) throw new UnprocessableEntityException('Fondos insuficientes');
      const nuevoSaldo = fromCents(saldo - totalCents);

      const desde = pendientes[0].numero;
      const hasta = pendientes[pendientes.length - 1].numero;
      await tx.query('UPDATE cuentas SET saldo = $1 WHERE id = $2', [nuevoSaldo, cuenta.id]);
      await tx.query(
        `INSERT INTO movimientos (cuenta_id, tipo, monto, saldo_posterior, descripcion, referencia) VALUES ($1, 'DEBITO', $2, $3, $4, $5)`,
        [cuenta.id, fromCents(totalCents), nuevoSaldo, `Pago de préstamo ${p.numero} · cuota${desde === hasta ? ` ${desde}` : `s ${desde}-${hasta}`}`, referencia],
      );
      await tx.query(
        `UPDATE prestamo_cuotas SET estado = 'PAGADA', pagada_at = now(), referencia = $2 WHERE prestamo_id = $1 AND numero BETWEEN $3 AND $4`,
        [id, referencia, desde, hasta],
      );
      const nuevoCapital = Math.max(0, toCents(p.saldoCapital) - capitalCents);
      const restantes = (await this.db.one<{ n: number }>("SELECT count(*)::int AS n FROM prestamo_cuotas WHERE prestamo_id = $1 AND estado = 'PENDIENTE'", [id], tx))!.n;
      const liquidado = restantes === 0;
      await tx.query(`UPDATE prestamos SET saldo_capital = $2, estado = $3, updated_at = now() WHERE id = $1`, [
        id,
        liquidado ? '0.00' : fromCents(nuevoCapital),
        liquidado ? 'LIQUIDADO' : 'VIGENTE',
      ]);
      return { p, cuenta, totalCents, desde, hasta, nuevoSaldo, saldoPrestamo: liquidado ? 0 : nuevoCapital / 100, restantes, liquidado };
    });

    await this.notificaciones.crear(
      clienteId,
      'PAGO',
      r.liquidado ? '¡Préstamo liquidado!' : 'Pago de préstamo realizado',
      `Pagaste Q${(r.totalCents / 100).toFixed(2)} (${dto.cuotas} cuota${dto.cuotas === 1 ? '' : 's'}) de ${r.p.productoNombre}. Ref. ${referencia}.`,
      '/prestamos',
    );
    return {
      referencia,
      prestamo: r.p.numero,
      producto: r.p.productoNombre,
      cuotasPagadas: dto.cuotas,
      desdeCuota: r.desde,
      hastaCuota: r.hasta,
      monto: r.totalCents / 100,
      cuentaOrigen: r.cuenta.numero,
      saldoCuenta: Number(r.nuevoSaldo),
      saldoPrestamo: r.saldoPrestamo,
      cuotasPendientes: r.restantes,
      liquidado: r.liquidado,
      fecha: new Date().toISOString(),
    };
  }
}
