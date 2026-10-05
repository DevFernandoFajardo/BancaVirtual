import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService, Queryable } from '../database/database.service';

export type TipoNotificacion = 'GESTION' | 'MOVIMIENTO' | 'PAGO' | 'TARJETA' | 'SEGURIDAD' | 'BANCO';

export interface Notificacion {
  id: string;
  tipo: TipoNotificacion;
  titulo: string;
  mensaje: string;
  enlace: string | null;
  leida: boolean;
  createdAt: Date;
}

const COLS = `id, tipo, titulo, mensaje, enlace, leida, created_at AS "createdAt"`;

@Injectable()
export class NotificacionesService {
  constructor(private readonly db: DatabaseService) {}

  /** Crea un aviso para un cliente. Nunca debe romper la operación principal: los errores se ignoran. */
  async crear(
    clienteId: string,
    tipo: TipoNotificacion,
    titulo: string,
    mensaje: string,
    enlace?: string,
    q: Queryable = this.db,
  ): Promise<void> {
    try {
      await q.query(
        `INSERT INTO notificaciones (cliente_id, tipo, titulo, mensaje, enlace) VALUES ($1, $2, $3, $4, $5)`,
        [clienteId, tipo, titulo.slice(0, 120), mensaje.slice(0, 400), enlace ?? null],
      );
    } catch {
      /* un aviso fallido no debe afectar dinero ni trámites */
    }
  }

  async listar(clienteId: string, soloNoLeidas = false, limit = 30) {
    const items = await this.db.rows<Notificacion>(
      `SELECT ${COLS} FROM notificaciones
        WHERE cliente_id = $1 ${soloNoLeidas ? 'AND leida = false' : ''}
        ORDER BY created_at DESC LIMIT $2`,
      [clienteId, limit],
    );
    const noLeidas = await this.contarNoLeidas(clienteId);
    return { items, noLeidas };
  }

  async contarNoLeidas(clienteId: string): Promise<number> {
    return (await this.db.one<{ n: number }>(
      'SELECT count(*)::int AS n FROM notificaciones WHERE cliente_id = $1 AND leida = false',
      [clienteId],
    ))!.n;
  }

  async marcarLeida(clienteId: string, id: string) {
    const r = await this.db.query('UPDATE notificaciones SET leida = true WHERE id = $1 AND cliente_id = $2', [id, clienteId]);
    if (!r.rowCount) throw new NotFoundException('Notificación no encontrada');
    return { ok: true };
  }

  async marcarTodasLeidas(clienteId: string) {
    await this.db.query('UPDATE notificaciones SET leida = true WHERE cliente_id = $1 AND leida = false', [clienteId]);
    return { ok: true };
  }

  /** Para la app administrativa: mensaje del banco a un cliente o a todos. */
  async enviarDelBanco(titulo: string, mensaje: string, clienteId?: string) {
    const r = clienteId
      ? await this.db.query(
          `INSERT INTO notificaciones (cliente_id, tipo, titulo, mensaje)
           SELECT id, 'BANCO', $2, $3 FROM clientes WHERE id = $1 AND rol = 'CLIENTE'`,
          [clienteId, titulo, mensaje],
        )
      : await this.db.query(
          `INSERT INTO notificaciones (cliente_id, tipo, titulo, mensaje)
           SELECT id, 'BANCO', $1, $2 FROM clientes WHERE rol = 'CLIENTE'`,
          [titulo, mensaje],
        );
    return { enviadas: r.rowCount };
  }
}
