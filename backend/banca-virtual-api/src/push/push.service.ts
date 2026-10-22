import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';
import { DatabaseService } from '../database/database.service';

export interface SuscripcionDto {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string;
}

/** Notificaciones push al teléfono/navegador (Web Push + VAPID). Si faltan las llaves VAPID queda desactivado sin romper nada. */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  readonly publicKey: string;
  private readonly activo: boolean;

  constructor(
    private readonly db: DatabaseService,
    config: ConfigService,
  ) {
    this.publicKey = (config.get<string>('VAPID_PUBLIC_KEY') ?? '').trim();
    const priv = (config.get<string>('VAPID_PRIVATE_KEY') ?? '').trim();
    const subject = (config.get<string>('VAPID_SUBJECT') ?? 'mailto:admin@banca.local').trim();
    this.activo = !!(this.publicKey && priv);
    if (this.activo) webpush.setVapidDetails(subject, this.publicKey, priv);
    else this.logger.warn('Push desactivado: faltan VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY');
  }

  get habilitado() {
    return this.activo;
  }

  async suscribir(clienteId: string, s: SuscripcionDto) {
    await this.db.query(
      `INSERT INTO push_suscripciones (cliente_id, endpoint, p256dh, auth, user_agent) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (endpoint) DO UPDATE SET cliente_id = EXCLUDED.cliente_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, user_agent = EXCLUDED.user_agent`,
      [clienteId, s.endpoint, s.keys.p256dh, s.keys.auth, (s.userAgent ?? '').slice(0, 200) || null],
    );
    return { ok: true };
  }

  async quitar(clienteId: string, endpoint: string) {
    await this.db.query('DELETE FROM push_suscripciones WHERE cliente_id = $1 AND endpoint = $2', [clienteId, endpoint]);
    return { ok: true };
  }

  async dispositivos(clienteId: string) {
    return (await this.db.one<{ n: number }>('SELECT count(*)::int AS n FROM push_suscripciones WHERE cliente_id = $1', [clienteId]))!.n;
  }

  /** Envía a todos los dispositivos del cliente (o de todos si `clienteId` es null). Nunca lanza: es "mejor esfuerzo". */
  async enviar(clienteId: string | null, titulo: string, cuerpo: string, url = '/notificaciones') {
    if (!this.activo) return;
    try {
      const subs = await this.db.rows<{ id: string; endpoint: string; p256dh: string; auth: string }>(
        clienteId
          ? 'SELECT id, endpoint, p256dh, auth FROM push_suscripciones WHERE cliente_id = $1'
          : 'SELECT id, endpoint, p256dh, auth FROM push_suscripciones',
        clienteId ? [clienteId] : [],
      );
      const payload = JSON.stringify({ titulo, cuerpo, url });
      await Promise.all(
        subs.map(async (s) => {
          try {
            await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86_400 });
          } catch (err: any) {
            if (err?.statusCode === 404 || err?.statusCode === 410) {
              await this.db.query('DELETE FROM push_suscripciones WHERE id = $1', [s.id]).catch(() => undefined);
            } else {
              this.logger.warn(`Push fallido (${err?.statusCode ?? err?.message})`);
            }
          }
        }),
      );
    } catch (err: any) {
      this.logger.warn(`No se pudo enviar push: ${err?.message}`); // p. ej. la tabla aún no existe
    }
  }
}
