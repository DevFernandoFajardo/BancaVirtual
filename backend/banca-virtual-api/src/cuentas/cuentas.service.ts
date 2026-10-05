import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomInt } from 'crypto';
import { fromCents, toCents } from '../common/money.util';
import { DatabaseService, Queryable } from '../database/database.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import {
  CUENTA_COLS,
  Cuenta,
  FiltroMovimientosDto,
  MOVIMIENTO_COLS,
  Movimiento,
  PLAZOS_FIJO,
  PeriodoDto,
  TipoCuenta,
} from './cuentas.schema';

@Injectable()
export class CuentasService {
  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService,
    private readonly notificaciones: NotificacionesService,
  ) {}

  /** 10 dígitos: prefijo por tipo (1 = monetaria, 2 = ahorro) + 9 aleatorios. */
  private async generarNumero(tipo: TipoCuenta, q: Queryable): Promise<string> {
    const prefijo = tipo === 'MONETARIA' ? '1' : tipo === 'AHORRO' ? '2' : '3';
    for (let i = 0; i < 10; i++) {
      const numero = prefijo + String(randomInt(0, 1_000_000_000)).padStart(9, '0');
      if (!(await this.db.one('SELECT 1 FROM cuentas WHERE numero = $1', [numero], q))) return numero;
    }
    throw new ConflictException('No se pudo generar un número de cuenta, intenta de nuevo');
  }

  async abrir(
    clienteId: string,
    tipo: TipoCuenta,
    alias?: string,
    q: Queryable = this.db,
    extra?: { plazoMeses: number; tasaAnual: number; capitalInicial: string; vence: string },
  ): Promise<Cuenta> {
    const numero = await this.generarNumero(tipo, q);
    if (extra) {
      const row = await this.db.one<Cuenta>(
        `INSERT INTO cuentas (numero, tipo, alias, cliente_id, saldo, plazo_meses, tasa_anual, capital_inicial, fecha_vencimiento)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $5, $8) RETURNING ${CUENTA_COLS}`,
        [numero, tipo, alias ?? null, clienteId, extra.capitalInicial, extra.plazoMeses, extra.tasaAnual, extra.vence],
        q,
      );
      return row!;
    }
    const row = await this.db.one<Cuenta>(
      `INSERT INTO cuentas (numero, tipo, alias, cliente_id) VALUES ($1, $2, $3, $4) RETURNING ${CUENTA_COLS}`,
      [numero, tipo, alias ?? null, clienteId],
      q,
    );
    return row!;
  }

  listar(clienteId: string): Promise<Cuenta[]> {
    return this.db.rows<Cuenta>(`SELECT ${CUENTA_COLS} FROM cuentas WHERE cliente_id = $1 AND estado <> 'CERRADA' ORDER BY created_at`, [
      clienteId,
    ]);
  }

  async obtener(clienteId: string, id: string): Promise<Cuenta> {
    const cuenta = await this.db.one<Cuenta>(`SELECT ${CUENTA_COLS} FROM cuentas WHERE id = $1`, [id]);
    // 404 en lugar de 403 para no revelar que la cuenta existe
    if (!cuenta || cuenta.clienteId !== clienteId) throw new NotFoundException('Cuenta no encontrada');
    return cuenta;
  }

  async listarMovimientos(clienteId: string, cuentaId: string, f: FiltroMovimientosDto) {
    await this.obtener(clienteId, cuentaId);
    const page = f.page ?? 1;
    const limit = f.limit ?? 20;
    const { cond, params } = this.condicionesMovimientos(cuentaId, f);
    const items = await this.db.rows<Movimiento>(
      `SELECT ${MOVIMIENTO_COLS} FROM movimientos WHERE ${cond}
        ORDER BY created_at DESC, id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, (page - 1) * limit],
    );
    const total = (await this.db.one<{ total: number }>(`SELECT count(*)::int AS total FROM movimientos WHERE ${cond}`, params))!
      .total;
    return { items, total, page, limit };
  }

  private condicionesMovimientos(cuentaId: string, f: { desde?: string; hasta?: string; tipo?: string; q?: string }) {
    const partes = ['cuenta_id = $1'];
    const params: unknown[] = [cuentaId];
    const dia = `(created_at AT TIME ZONE 'America/Guatemala')::date`;
    if (f.desde) partes.push(`${dia} >= $${params.push(f.desde)}::date`);
    if (f.hasta) partes.push(`${dia} <= $${params.push(f.hasta)}::date`);
    if (f.tipo) partes.push(`tipo = $${params.push(f.tipo)}`);
    if (f.q?.trim()) {
      const like = `%${f.q.trim().replace(/[\\%_]/g, (c) => '\\' + c)}%`;
      const i = params.push(like);
      partes.push(`(descripcion ILIKE $${i} OR referencia ILIKE $${i})`);
    }
    return { cond: partes.join(' AND '), params };
  }

  /** Estado de cuenta completo de un periodo (para la descarga en PDF). */
  async estadoDeCuenta(clienteId: string, cuentaId: string, p: PeriodoDto) {
    const cuenta = await this.obtener(clienteId, cuentaId);
    const hoy = (
      await this.db.one<{ d: string }>(`SELECT (now() AT TIME ZONE 'America/Guatemala')::date::text AS d`)
    )!.d;
    const hasta = p.hasta ?? hoy;
    const desde = p.desde ?? hasta.slice(0, 8) + '01';
    if (desde > hasta) throw new BadRequestException('La fecha inicial no puede ser posterior a la final');

    const { cond, params } = this.condicionesMovimientos(cuentaId, { desde, hasta });
    const movimientos = await this.db.rows<Movimiento>(
      `SELECT ${MOVIMIENTO_COLS} FROM movimientos WHERE ${cond} ORDER BY created_at, id LIMIT 2000`,
      params,
    );
    let saldoInicial: string;
    if (movimientos.length) {
      const m = movimientos[0];
      const post = toCents(m.saldoPosterior);
      saldoInicial = fromCents(m.tipo === 'CREDITO' ? post - toCents(m.monto) : post + toCents(m.monto));
    } else {
      const prev = await this.db.one<{ s: string }>(
        `SELECT saldo_posterior::text AS s FROM movimientos
          WHERE cuenta_id = $1 AND (created_at AT TIME ZONE 'America/Guatemala')::date < $2::date
          ORDER BY created_at DESC, id DESC LIMIT 1`,
        [cuentaId, desde],
      );
      saldoInicial = prev?.s ?? '0.00';
    }
    const saldoFinal = movimientos.length ? movimientos[movimientos.length - 1].saldoPosterior : saldoInicial;
    const sum = (tipo: string) => fromCents(movimientos.filter((m) => m.tipo === tipo).reduce((a, m) => a + toCents(m.monto), 0));
    const titular = (await this.db.one<{ n: string }>(
      `SELECT primer_nombre || ' ' || primer_apellido AS n FROM clientes WHERE id = $1`,
      [clienteId],
    ))!.n;
    return {
      cuenta,
      titular,
      periodo: { desde, hasta },
      saldoInicial,
      saldoFinal,
      totalCreditos: sum('CREDITO'),
      totalDebitos: sum('DEBITO'),
      movimientos,
      generadoEn: new Date().toISOString(),
    };
  }

  /** Antes de transferir, la app muestra a quién pertenece la cuenta destino (apellido enmascarado). */
  async validarNumero(numero: string) {
    const r = await this.db.one<{
      numero: string;
      tipo: TipoCuenta;
      moneda: string;
      primerNombre: string;
      primerApellido: string;
    }>(
      `SELECT c.numero, c.tipo, c.moneda, cl.primer_nombre AS "primerNombre", cl.primer_apellido AS "primerApellido"
         FROM cuentas c JOIN clientes cl ON cl.id = c.cliente_id
        WHERE c.numero = $1 AND c.estado = 'ACTIVA' AND c.tipo <> 'PLAZO_FIJO'`,
      [numero],
    );
    if (!r) throw new NotFoundException('Cuenta no encontrada');
    const apellido = r.primerApellido;
    return {
      numero: r.numero,
      tipo: r.tipo,
      moneda: r.moneda,
      titular: `${r.primerNombre} ${apellido.charAt(0)}${'*'.repeat(Math.max(apellido.length - 1, 2))}`,
    };
  }

  /** Solo para demostración: simula un depósito en ventanilla para poder probar transferencias. */
  async depositoDemo(clienteId: string, cuentaId: string, monto: number): Promise<Cuenta> {
    if (this.config.get('ALLOW_DEMO_DEPOSITS') !== 'true') {
      throw new ForbiddenException('Los depósitos de demostración están deshabilitados');
    }
    return this.db.transaction(async (tx) => {
      const cuenta = await this.db.one<Cuenta>(
        `SELECT ${CUENTA_COLS} FROM cuentas WHERE id = $1 FOR UPDATE`,
        [cuentaId],
        tx,
      );
      if (!cuenta || cuenta.clienteId !== clienteId) throw new NotFoundException('Cuenta no encontrada');
      if (cuenta.estado !== 'ACTIVA') throw new ConflictException('La cuenta no está activa');
      if (cuenta.tipo === 'PLAZO_FIJO') throw new ConflictException('No se puede depositar en un plazo fijo');

      const montoCents = toCents(monto);
      const nuevoSaldo = fromCents(toCents(cuenta.saldo) + montoCents);
      await tx.query('UPDATE cuentas SET saldo = $1 WHERE id = $2', [nuevoSaldo, cuenta.id]);
      await tx.query(
        `INSERT INTO movimientos (cuenta_id, tipo, monto, saldo_posterior, descripcion)
         VALUES ($1, 'CREDITO', $2, $3, 'Depósito de demostración')`,
        [cuenta.id, fromCents(montoCents), nuevoSaldo],
      );
      return { ...cuenta, saldo: nuevoSaldo };
    });
  }

  /** Constituye un plazo fijo debitando el capital de otra cuenta del cliente. */
  async constituirPlazoFijo(clienteId: string, cuentaOrigenId: string, monto: number, plazoMeses: number) {
    const tasa = PLAZOS_FIJO[plazoMeses];
    const montoCents = toCents(monto);
    const plazo = await this.db.transaction(async (tx) => {
      const origen = await this.db.one<Cuenta>(`SELECT ${CUENTA_COLS} FROM cuentas WHERE id = $1 FOR UPDATE`, [cuentaOrigenId], tx);
      if (!origen || origen.clienteId !== clienteId) throw new NotFoundException('Cuenta de origen no encontrada');
      if (origen.estado !== 'ACTIVA' || origen.tipo === 'PLAZO_FIJO') {
        throw new UnprocessableEntityException('Elige una cuenta monetaria o de ahorro activa');
      }
      const saldo = toCents(origen.saldo);
      if (saldo < montoCents) throw new UnprocessableEntityException('Fondos insuficientes');

      const vence = (await this.db.one<{ d: string }>(
        `SELECT ((now() AT TIME ZONE 'America/Guatemala')::date + make_interval(months => $1))::text AS d`,
        [plazoMeses],
        tx,
      ))!.d;
      const nuevoSaldo = fromCents(saldo - montoCents);
      const monto2 = fromCents(montoCents);
      await tx.query('UPDATE cuentas SET saldo = $1 WHERE id = $2', [nuevoSaldo, origen.id]);
      const cuenta = await this.abrir(clienteId, 'PLAZO_FIJO', `Plazo fijo ${plazoMeses} meses`, tx, {
        plazoMeses,
        tasaAnual: tasa,
        capitalInicial: monto2,
        vence,
      });
      await tx.query(
        `INSERT INTO movimientos (cuenta_id, tipo, monto, saldo_posterior, descripcion) VALUES
           ($1, 'DEBITO',  $3, $4, $5),
           ($2, 'CREDITO', $3, $3, 'Constitución de plazo fijo')`,
        [origen.id, cuenta.id, monto2, nuevoSaldo, `Constitución de plazo fijo ${cuenta.numero}`],
      );
      return cuenta;
    });
    await this.notificaciones.crear(
      clienteId,
      'MOVIMIENTO',
      'Plazo fijo constituido',
      `Tu plazo fijo a ${plazoMeses} meses por Q${monto.toFixed(2)} (${tasa}% anual) vence el ${plazo.fechaVencimiento}.`,
      `/cuentas/${plazo.id}`,
    );
    return plazo;
  }

  /** Cierra un plazo fijo: al vencimiento paga capital + intereses; antes, solo el capital. */
  async liquidarPlazoFijo(clienteId: string, plazoId: string, destinoId: string) {
    const resultado = await this.db.transaction(async (tx) => {
      const bloqueadas = await this.db.rows<Cuenta>(
        `SELECT ${CUENTA_COLS} FROM cuentas WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE`,
        [[plazoId, destinoId]],
        tx,
      );
      const plazo = bloqueadas.find((c) => c.id === plazoId);
      const destino = bloqueadas.find((c) => c.id === destinoId);
      if (!plazo || plazo.clienteId !== clienteId || plazo.tipo !== 'PLAZO_FIJO') throw new NotFoundException('Plazo fijo no encontrado');
      if (plazo.estado !== 'ACTIVA') throw new ConflictException('Este plazo fijo ya fue liquidado');
      if (!destino || destino.clienteId !== clienteId || destino.estado !== 'ACTIVA' || destino.tipo === 'PLAZO_FIJO') {
        throw new UnprocessableEntityException('Elige una cuenta monetaria o de ahorro activa como destino');
      }
      const hoy = (await this.db.one<{ d: string }>(`SELECT (now() AT TIME ZONE 'America/Guatemala')::date::text AS d`, [], tx))!.d;
      const vencido = !!plazo.fechaVencimiento && plazo.fechaVencimiento <= hoy;
      const capital = toCents(plazo.capitalInicial ?? plazo.saldo);
      const interes = vencido
        ? Math.round((capital * Number(plazo.tasaAnual ?? 0) * (plazo.plazoMeses ?? 0)) / 12 / 100)
        : 0;
      const total = capital + interes;
      const saldoDestino = fromCents(toCents(destino.saldo) + total);

      await tx.query(`UPDATE cuentas SET saldo = 0, estado = 'CERRADA' WHERE id = $1`, [plazo.id]);
      await tx.query('UPDATE cuentas SET saldo = $1 WHERE id = $2', [saldoDestino, destino.id]);
      await tx.query(
        `INSERT INTO movimientos (cuenta_id, tipo, monto, saldo_posterior, descripcion) VALUES
           ($1, 'DEBITO',  $3, '0.00', $5),
           ($2, 'CREDITO', $3, $4, $6)`,
        [
          plazo.id,
          destino.id,
          fromCents(total),
          saldoDestino,
          vencido ? 'Liquidación de plazo fijo al vencimiento' : 'Cancelación anticipada de plazo fijo',
          `Acreditación de plazo fijo ${plazo.numero}`,
        ],
      );
      return { vencido, capital: fromCents(capital), intereses: fromCents(interes), total: fromCents(total), destino: destino.numero };
    });
    await this.notificaciones.crear(
      clienteId,
      'MOVIMIENTO',
      'Plazo fijo liquidado',
      `Se acreditaron Q${resultado.total} a tu cuenta ${resultado.destino}${resultado.vencido ? ` (intereses Q${resultado.intereses})` : ' sin intereses por cancelación anticipada'}.`,
      '/dashboard',
    );
    return resultado;
  }
}
