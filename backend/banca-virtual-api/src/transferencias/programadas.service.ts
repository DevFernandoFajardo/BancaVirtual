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
import { CuentasService } from '../cuentas/cuentas.service';
import { DatabaseService } from '../database/database.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { CrearProgramadaDto, Programada } from './programadas.schema';
import { TransferenciasService } from './transferencias.service';

const COLS = `p.id, p.cuenta_origen_id AS "cuentaOrigenId", co.numero AS "cuentaOrigenNumero",
  p.cuenta_destino_numero AS "cuentaDestinoNumero", p.monto::float8 AS monto, p.descripcion, p.frecuencia,
  p.proxima_ejecucion::text AS "proximaEjecucion", p.estado, p.ultima_ejecucion AS "ultimaEjecucion",
  p.ultimo_error AS "ultimoError", p.created_at AS "createdAt"`;
const HOY = `(now() AT TIME ZONE 'America/Guatemala')::date`;

/** Transferencias programadas: se ejecutan solas cada minuto (y también al consultar la lista). */
@Injectable()
export class ProgramadasService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProgramadasService.name);
  private timer?: NodeJS.Timeout;
  private ejecutando = false;

  constructor(
    private readonly db: DatabaseService,
    private readonly transferencias: TransferenciasService,
    private readonly cuentas: CuentasService,
    private readonly notificaciones: NotificacionesService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    const seg = Number(this.config.get('PROGRAMADAS_INTERVALO_SEGUNDOS') ?? 60);
    if (seg > 0) {
      this.timer = setInterval(() => void this.ejecutarVencidas(), seg * 1000);
      this.timer.unref();
    }
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async listar(clienteId: string): Promise<Programada[]> {
    await this.ejecutarVencidas();
    return this.db.rows<Programada>(
      `SELECT ${COLS} FROM transferencias_programadas p JOIN cuentas co ON co.id = p.cuenta_origen_id
        WHERE p.cliente_id = $1 AND p.estado <> 'CANCELADA'
        ORDER BY (p.estado = 'ACTIVA') DESC, p.proxima_ejecucion`,
      [clienteId],
    );
  }

  async crear(clienteId: string, dto: CrearProgramadaDto) {
    const origen = await this.cuentas.obtener(clienteId, dto.cuentaOrigenId);
    if (origen.estado !== 'ACTIVA' || origen.tipo === 'PLAZO_FIJO') {
      throw new UnprocessableEntityException('Elige una cuenta de origen activa (monetaria o ahorro)');
    }
    if (origen.numero === dto.cuentaDestinoNumero) throw new BadRequestException('La cuenta origen y destino no pueden ser la misma');
    await this.cuentas.validarNumero(dto.cuentaDestinoNumero); // 404 si no existe
    const max = Number(this.config.get('MAX_TRANSFER_AMOUNT') ?? 50000);
    if (dto.monto > max) throw new UnprocessableEntityException(`El monto máximo por transferencia es Q${max.toFixed(2)}`);

    const hoy = (await this.db.one<{ d: string }>(`SELECT ${HOY}::text AS d`))!.d;
    if (dto.fecha < hoy) throw new BadRequestException('La fecha de la primera ejecución no puede estar en el pasado');

    const row = await this.db.one<{ id: string }>(
      `INSERT INTO transferencias_programadas
         (cliente_id, cuenta_origen_id, cuenta_destino_numero, monto, descripcion, frecuencia, proxima_ejecucion)
       VALUES ($1, $2, $3, $4, $5, $6, $7::date) RETURNING id`,
      [clienteId, origen.id, dto.cuentaDestinoNumero, dto.monto.toFixed(2), dto.descripcion?.trim() || 'Transferencia programada', dto.frecuencia, dto.fecha],
    );
    await this.ejecutarVencidas(); // si es para hoy, se ejecuta de inmediato
    return this.una(clienteId, row!.id);
  }

  private async una(clienteId: string, id: string) {
    const p = await this.db.one<Programada>(
      `SELECT ${COLS} FROM transferencias_programadas p JOIN cuentas co ON co.id = p.cuenta_origen_id WHERE p.id = $1 AND p.cliente_id = $2`,
      [id, clienteId],
    );
    if (!p) throw new NotFoundException('Transferencia programada no encontrada');
    return p;
  }

  async cambiarEstado(clienteId: string, id: string, a: 'PAUSADA' | 'ACTIVA' | 'CANCELADA') {
    const desde = a === 'ACTIVA' ? ['PAUSADA'] : ['ACTIVA', 'PAUSADA'];
    const r = await this.db.query(
      `UPDATE transferencias_programadas SET estado = $3 WHERE id = $1 AND cliente_id = $2 AND estado = ANY($4::text[])`,
      [id, clienteId, a, desde],
    );
    if (!r.rowCount) {
      await this.una(clienteId, id); // 404 si no es suya
      throw new BadRequestException('No se puede cambiar el estado de esta transferencia');
    }
    return this.una(clienteId, id);
  }

  /** Reclama (en una sola sentencia) las programadas vencidas y las ejecuta una por una. */
  async ejecutarVencidas() {
    if (this.ejecutando) return;
    this.ejecutando = true;
    try {
      const vencidas = await this.db.rows<{
        id: string; clienteId: string; origenId: string; destino: string; monto: string; descripcion: string; frecuencia: string;
      }>(
        `UPDATE transferencias_programadas SET
            proxima_ejecucion = CASE frecuencia
              WHEN 'SEMANAL'   THEN GREATEST(proxima_ejecucion + 7,  ${HOY} + 1)
              WHEN 'QUINCENAL' THEN GREATEST(proxima_ejecucion + 15, ${HOY} + 1)
              WHEN 'MENSUAL'   THEN GREATEST((proxima_ejecucion + interval '1 month')::date, ${HOY} + 1)
              ELSE proxima_ejecucion END,
            estado = CASE WHEN frecuencia = 'UNICA' THEN 'COMPLETADA' ELSE estado END,
            ultima_ejecucion = now()
          WHERE estado = 'ACTIVA' AND proxima_ejecucion <= ${HOY}
          RETURNING id, cliente_id AS "clienteId", cuenta_origen_id AS "origenId", cuenta_destino_numero AS destino,
                    monto::text AS monto, descripcion, frecuencia`,
      );
      for (const v of vencidas) {
        try {
          const c = await this.transferencias.transferir(v.clienteId, {
            cuentaOrigenId: v.origenId,
            cuentaDestinoNumero: v.destino,
            monto: Number(v.monto),
            descripcion: v.descripcion,
          });
          await this.db.query('UPDATE transferencias_programadas SET ultimo_error = NULL WHERE id = $1', [v.id]);
          await this.notificaciones.crear(
            v.clienteId,
            'MOVIMIENTO',
            'Transferencia programada ejecutada',
            `Se enviaron Q${Number(v.monto).toFixed(2)} a la cuenta ${v.destino}. Ref. ${c.referencia}.`,
            '/transferencias',
          );
        } catch (err: any) {
          const msg = String(err?.message ?? 'Error desconocido').slice(0, 200);
          await this.db.query(
            `UPDATE transferencias_programadas SET ultimo_error = $2,
                    estado = CASE WHEN frecuencia = 'UNICA' THEN 'CANCELADA' ELSE estado END
              WHERE id = $1`,
            [v.id, msg],
          );
          await this.notificaciones.crear(
            v.clienteId,
            'MOVIMIENTO',
            'No se pudo ejecutar una transferencia programada',
            `${msg}. Revisa tu saldo y la cuenta destino.`,
            '/transferencias',
          );
        }
      }
    } catch (err: any) {
      this.logger.error(`Error al ejecutar transferencias programadas: ${err?.message}`);
    } finally {
      this.ejecutando = false;
    }
  }
}
