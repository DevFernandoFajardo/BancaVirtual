import { BadRequestException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { fromCents, toCents } from '../common/money.util';
import { CUENTA_COLS, Cuenta } from '../cuentas/cuentas.schema';
import { DatabaseService } from '../database/database.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { CrearTransferenciaDto } from './transferencias.schema';

@Injectable()
export class TransferenciasService {
  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService,
    private readonly notificaciones: NotificacionesService,
  ) {}

  /**
   * Transferencia simulada entre cuentas del mismo banco.
   * Débito + crédito + registro ocurren en UNA transacción; las dos cuentas se bloquean
   * (SELECT ... FOR UPDATE, siempre en orden de id) para evitar saldos inconsistentes y deadlocks.
   */
  async transferir(clienteId: string, dto: CrearTransferenciaDto) {
    const max = Number(this.config.get('MAX_TRANSFER_AMOUNT') ?? 50000);
    if (dto.monto > max) {
      throw new UnprocessableEntityException(`El monto máximo por transferencia es Q${max.toFixed(2)}`);
    }

    // Resolver la cuenta destino fuera de la transacción (solo lectura)
    const destinoRef = await this.db.one<{ id: string }>('SELECT id FROM cuentas WHERE numero = $1', [
      dto.cuentaDestinoNumero,
    ]);
    if (!destinoRef) throw new NotFoundException('La cuenta destino no existe');
    if (destinoRef.id === dto.cuentaOrigenId) {
      throw new BadRequestException('La cuenta origen y destino no pueden ser la misma');
    }

    const montoCents = toCents(dto.monto);
    const descripcion = dto.descripcion?.trim() || 'Transferencia';

    const resultado = await this.db.transaction(async (tx) => {
      // Bloqueo de ambas filas en orden de id (evita deadlocks entre transferencias cruzadas)
      const bloqueadas = await this.db.rows<Cuenta>(
        `SELECT ${CUENTA_COLS} FROM cuentas WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE`,
        [[dto.cuentaOrigenId, destinoRef.id]],
        tx,
      );
      const origen = bloqueadas.find((c) => c.id === dto.cuentaOrigenId);
      const destino = bloqueadas.find((c) => c.id === destinoRef.id);

      // 404 si la cuenta origen no es del cliente (no revelamos si existe)
      if (!origen || origen.clienteId !== clienteId) throw new NotFoundException('Cuenta origen no encontrada');
      if (!destino) throw new NotFoundException('La cuenta destino no existe');
      if (origen.estado !== 'ACTIVA') throw new UnprocessableEntityException('La cuenta origen no está activa');
      if (destino.estado !== 'ACTIVA') throw new UnprocessableEntityException('La cuenta destino no está activa');
      if (origen.tipo === 'PLAZO_FIJO') throw new UnprocessableEntityException('No se puede transferir desde un plazo fijo: liquídalo primero');
      if (destino.tipo === 'PLAZO_FIJO') throw new UnprocessableEntityException('La cuenta destino no admite transferencias');
      if (origen.moneda !== destino.moneda) {
        throw new UnprocessableEntityException('No se permiten transferencias entre monedas distintas');
      }

      const saldoOrigen = toCents(origen.saldo);
      if (saldoOrigen < montoCents) throw new UnprocessableEntityException('Fondos insuficientes');

      const saldoOrigenDespues = fromCents(saldoOrigen - montoCents);
      const saldoDestinoDespues = fromCents(toCents(destino.saldo) + montoCents);
      await tx.query('UPDATE cuentas SET saldo = $1 WHERE id = $2', [saldoOrigenDespues, origen.id]);
      await tx.query('UPDATE cuentas SET saldo = $1 WHERE id = $2', [saldoDestinoDespues, destino.id]);

      const referencia = 'TRF-' + randomBytes(6).toString('hex').toUpperCase();
      const monto = fromCents(montoCents);

      const t = (await this.db.one<{ id: string; createdAt: Date }>(
        `INSERT INTO transferencias (referencia, cuenta_origen_id, cuenta_destino_id, monto, moneda, descripcion)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, created_at AS "createdAt"`,
        [referencia, origen.id, destino.id, monto, origen.moneda, descripcion],
        tx,
      ))!;

      await tx.query(
        `INSERT INTO movimientos (cuenta_id, tipo, monto, saldo_posterior, descripcion, referencia) VALUES
           ($1, 'DEBITO',  $3, $4, $5, $8),
           ($2, 'CREDITO', $3, $6, $7, $8)`,
        [
          origen.id,
          destino.id,
          monto,
          saldoOrigenDespues,
          `Transferencia a ${destino.numero}: ${descripcion}`,
          saldoDestinoDespues,
          `Transferencia de ${origen.numero}: ${descripcion}`,
          referencia,
        ],
      );

      return {
        id: t.id,
        referencia,
        estado: 'COMPLETADA',
        monto: Number(monto),
        moneda: origen.moneda,
        descripcion,
        cuentaOrigen: origen.numero,
        cuentaDestino: destino.numero,
        saldoOrigenDespues: Number(saldoOrigenDespues),
        fecha: t.createdAt,
        _destinoClienteId: destino.clienteId,
      };
    });

    const { _destinoClienteId, ...comprobante } = resultado;
    if (_destinoClienteId !== clienteId) {
      await this.notificaciones.crear(
        _destinoClienteId,
        'MOVIMIENTO',
        'Transferencia recibida',
        `Recibiste Q${comprobante.monto.toFixed(2)} en tu cuenta ${comprobante.cuentaDestino}. Ref. ${comprobante.referencia}.`,
        '/transferencias',
      );
    }
    return comprobante;
  }

  /** Comprobante de una transferencia (lo puede ver quien la envió o la recibió). */
  async comprobante(clienteId: string, referencia: string) {
    const t = await this.db.one<{
      referencia: string; estado: string; monto: number; moneda: string; descripcion: string; fecha: Date;
      cuentaOrigen: string; cuentaDestino: string; clienteOrigen: string; clienteDestino: string;
      nombreOrigen: string; apellidoOrigen: string; nombreDestino: string; apellidoDestino: string;
    }>(
      `SELECT t.referencia, t.estado, t.monto::float8 AS monto, t.moneda, t.descripcion, t.created_at AS fecha,
              co.numero AS "cuentaOrigen", cd.numero AS "cuentaDestino",
              co.cliente_id AS "clienteOrigen", cd.cliente_id AS "clienteDestino",
              clo.primer_nombre AS "nombreOrigen", clo.primer_apellido AS "apellidoOrigen",
              cld.primer_nombre AS "nombreDestino", cld.primer_apellido AS "apellidoDestino"
         FROM transferencias t
         JOIN cuentas co ON co.id = t.cuenta_origen_id JOIN clientes clo ON clo.id = co.cliente_id
         JOIN cuentas cd ON cd.id = t.cuenta_destino_id JOIN clientes cld ON cld.id = cd.cliente_id
        WHERE t.referencia = $1`,
      [referencia],
    );
    if (!t || (t.clienteOrigen !== clienteId && t.clienteDestino !== clienteId)) {
      throw new NotFoundException('Comprobante no encontrado');
    }
    const mask = (n: string, a: string) => `${n} ${a.charAt(0)}${'*'.repeat(Math.max(a.length - 1, 2))}`;
    return {
      referencia: t.referencia,
      estado: t.estado,
      direccion: t.clienteOrigen === clienteId ? 'ENVIADA' : 'RECIBIDA',
      monto: t.monto,
      moneda: t.moneda,
      descripcion: t.descripcion,
      fecha: t.fecha,
      cuentaOrigen: t.cuentaOrigen,
      cuentaDestino: t.cuentaDestino,
      titularOrigen: t.clienteOrigen === clienteId ? `${t.nombreOrigen} ${t.apellidoOrigen}` : mask(t.nombreOrigen, t.apellidoOrigen),
      titularDestino: t.clienteDestino === clienteId ? `${t.nombreDestino} ${t.apellidoDestino}` : mask(t.nombreDestino, t.apellidoDestino),
    };
  }

  /** Transferencias enviadas o recibidas por cuentas del cliente. */
  async listar(clienteId: string, page = 1, limit = 20) {
    const items = await this.db.rows(
      `SELECT t.id, t.referencia,
              CASE WHEN co.cliente_id = $1 THEN 'ENVIADA' ELSE 'RECIBIDA' END AS direccion,
              t.monto::float8 AS monto, t.moneda, t.descripcion,
              co.numero AS "cuentaOrigen", cd.numero AS "cuentaDestino",
              t.estado, t.created_at AS fecha
         FROM transferencias t
         JOIN cuentas co ON co.id = t.cuenta_origen_id
         JOIN cuentas cd ON cd.id = t.cuenta_destino_id
        WHERE co.cliente_id = $1 OR cd.cliente_id = $1
        ORDER BY t.created_at DESC, t.id DESC
        LIMIT $2 OFFSET $3`,
      [clienteId, limit, (page - 1) * limit],
    );
    const total = (await this.db.one<{ total: number }>(
      `SELECT count(*)::int AS total
         FROM transferencias t
         JOIN cuentas co ON co.id = t.cuenta_origen_id
         JOIN cuentas cd ON cd.id = t.cuenta_destino_id
        WHERE co.cliente_id = $1 OR cd.cliente_id = $1`,
      [clienteId],
    ))!.total;
    return { items, total, page, limit };
  }
}
