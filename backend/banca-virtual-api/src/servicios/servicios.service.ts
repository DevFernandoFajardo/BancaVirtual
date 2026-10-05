import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { fromCents, toCents } from '../common/money.util';
import { CUENTA_COLS, Cuenta } from '../cuentas/cuentas.schema';
import { DatabaseService } from '../database/database.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { PagarServicioDto } from './servicios.schema';

@Injectable()
export class ServiciosService {
  constructor(
    private readonly db: DatabaseService,
    private readonly notificaciones: NotificacionesService,
  ) {}

  catalogo() {
    return this.db.rows(
      `SELECT codigo, nombre, categoria, referencia_etiqueta AS "referenciaEtiqueta" FROM servicios_pago ORDER BY categoria, nombre`,
    );
  }

  async pagar(clienteId: string, dto: PagarServicioDto) {
    const servicio = await this.db.one<{ codigo: string; nombre: string }>(
      'SELECT codigo, nombre FROM servicios_pago WHERE codigo = $1',
      [dto.servicioCodigo],
    );
    if (!servicio) throw new NotFoundException('Servicio no encontrado');

    const montoCents = toCents(dto.monto);
    const referencia = 'PAG-' + randomBytes(6).toString('hex').toUpperCase();
    const contrato = dto.contrato.trim();

    const r = await this.db.transaction(async (tx) => {
      const cuenta = await this.db.one<Cuenta>(`SELECT ${CUENTA_COLS} FROM cuentas WHERE id = $1 FOR UPDATE`, [dto.cuentaId], tx);
      if (!cuenta || cuenta.clienteId !== clienteId) throw new NotFoundException('Cuenta no encontrada');
      if (cuenta.estado !== 'ACTIVA' || cuenta.tipo === 'PLAZO_FIJO') {
        throw new UnprocessableEntityException('Elige una cuenta monetaria o de ahorro activa');
      }
      const saldo = toCents(cuenta.saldo);
      if (saldo < montoCents) throw new UnprocessableEntityException('Fondos insuficientes');
      const nuevo = fromCents(saldo - montoCents);
      await tx.query('UPDATE cuentas SET saldo = $1 WHERE id = $2', [nuevo, cuenta.id]);
      await tx.query(
        `INSERT INTO movimientos (cuenta_id, tipo, monto, saldo_posterior, descripcion, referencia)
         VALUES ($1, 'DEBITO', $2, $3, $4, $5)`,
        [cuenta.id, fromCents(montoCents), nuevo, `Pago de servicio: ${servicio.nombre} (${contrato})`, referencia],
      );
      const pago = await this.db.one<{ createdAt: Date }>(
        `INSERT INTO pagos_servicios (cliente_id, cuenta_id, servicio_codigo, servicio_nombre, contrato, monto, referencia)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING created_at AS "createdAt"`,
        [clienteId, cuenta.id, servicio.codigo, servicio.nombre, contrato, fromCents(montoCents), referencia],
        tx,
      );
      return { cuentaNumero: cuenta.numero, saldoDespues: nuevo, fecha: pago!.createdAt };
    });

    await this.notificaciones.crear(
      clienteId,
      'PAGO',
      'Pago de servicio realizado',
      `Pagaste Q${dto.monto.toFixed(2)} a ${servicio.nombre}. Ref. ${referencia}.`,
      '/servicios',
    );
    return {
      referencia,
      servicio: servicio.nombre,
      contrato,
      monto: Number(fromCents(montoCents)),
      cuentaOrigen: r.cuentaNumero,
      saldoDespues: Number(r.saldoDespues),
      fecha: r.fecha,
    };
  }

  async historial(clienteId: string, page = 1, limit = 20) {
    const items = await this.db.rows(
      `SELECT p.id, p.referencia, p.servicio_codigo AS "servicioCodigo", p.servicio_nombre AS servicio, p.contrato,
              p.monto::float8 AS monto, c.numero AS "cuentaOrigen", p.created_at AS fecha
         FROM pagos_servicios p JOIN cuentas c ON c.id = p.cuenta_id
        WHERE p.cliente_id = $1 ORDER BY p.created_at DESC, p.id DESC LIMIT $2 OFFSET $3`,
      [clienteId, limit, (page - 1) * limit],
    );
    const total = (await this.db.one<{ n: number }>('SELECT count(*)::int AS n FROM pagos_servicios WHERE cliente_id = $1', [clienteId]))!.n;
    return { items, total, page, limit };
  }
}
