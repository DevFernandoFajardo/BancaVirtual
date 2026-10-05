import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthUser } from '../auth/auth.schema';
import { decrypt, encrypt } from '../common/crypto.util';
import { generarSecretoTotp, otpauthUrl, verificarTotp } from '../common/totp.util';
import { DatabaseService } from '../database/database.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';

@Injectable()
export class SeguridadService {
  constructor(
    private readonly db: DatabaseService,
    private readonly notificaciones: NotificacionesService,
  ) {}

  async estado(clienteId: string) {
    const r = await this.db.one<{ totpActivo: boolean; sesiones: number }>(
      `SELECT c.totp_activo AS "totpActivo",
              (SELECT count(*)::int FROM sesiones s WHERE s.cliente_id = c.id AND NOT s.revocada AND s.expires_at > now()) AS sesiones
         FROM clientes c WHERE c.id = $1`,
      [clienteId],
    );
    if (!r) throw new NotFoundException('Cliente no encontrado');
    return { dosFactoresActivo: r.totpActivo, sesionesActivas: r.sesiones };
  }

  async cambiarPassword(user: AuthUser, passwordActual: string, passwordNueva: string) {
    const c = await this.db.one<{ hash: string }>('SELECT password_hash AS hash FROM clientes WHERE id = $1', [user.sub]);
    if (!c) throw new NotFoundException('Cliente no encontrado');
    if (!(await bcrypt.compare(passwordActual, c.hash))) throw new UnauthorizedException('La contraseña actual es incorrecta');
    if (passwordActual === passwordNueva) throw new BadRequestException('La contraseña nueva debe ser distinta de la actual');

    await this.db.query('UPDATE clientes SET password_hash = $2, updated_at = now() WHERE id = $1', [
      user.sub,
      await bcrypt.hash(passwordNueva, 12),
    ]);
    // Por seguridad se cierran las demás sesiones
    await this.db.query('UPDATE sesiones SET revocada = true WHERE cliente_id = $1 AND id <> $2', [user.sub, user.sid ?? null]);
    await this.notificaciones.crear(user.sub, 'SEGURIDAD', 'Contraseña actualizada', 'Cambiaste tu contraseña y cerramos tus otras sesiones.', '/seguridad');
    return { ok: true };
  }

  // ------------------------------------------------------------- segundo factor (TOTP)

  async iniciarDosFactores(clienteId: string) {
    const c = await this.db.one<{ email: string; activo: boolean }>('SELECT email, totp_activo AS activo FROM clientes WHERE id = $1', [clienteId]);
    if (!c) throw new NotFoundException('Cliente no encontrado');
    if (c.activo) throw new ConflictException('La verificación en dos pasos ya está activa');
    const secreto = generarSecretoTotp();
    await this.db.query('UPDATE clientes SET totp_secreto_cifrado = $2 WHERE id = $1', [clienteId, encrypt(secreto)]);
    return { secreto, otpauthUrl: otpauthUrl(secreto, c.email) };
  }

  async activarDosFactores(clienteId: string, codigo: string) {
    const c = await this.db.one<{ secreto: string | null; activo: boolean }>(
      'SELECT totp_secreto_cifrado AS secreto, totp_activo AS activo FROM clientes WHERE id = $1',
      [clienteId],
    );
    if (!c?.secreto) throw new BadRequestException('Primero genera tu código de configuración');
    if (c.activo) throw new ConflictException('La verificación en dos pasos ya está activa');
    if (!verificarTotp(decrypt(c.secreto), codigo)) throw new BadRequestException('El código no es correcto. Revisa la hora de tu teléfono.');
    await this.db.query('UPDATE clientes SET totp_activo = true WHERE id = $1', [clienteId]);
    await this.notificaciones.crear(clienteId, 'SEGURIDAD', 'Verificación en dos pasos activada', 'Ahora te pediremos un código al iniciar sesión.', '/seguridad');
    return { dosFactoresActivo: true };
  }

  async desactivarDosFactores(clienteId: string, password: string, codigo: string) {
    const c = await this.db.one<{ hash: string; secreto: string | null; activo: boolean }>(
      'SELECT password_hash AS hash, totp_secreto_cifrado AS secreto, totp_activo AS activo FROM clientes WHERE id = $1',
      [clienteId],
    );
    if (!c?.activo || !c.secreto) throw new BadRequestException('La verificación en dos pasos no está activa');
    if (!(await bcrypt.compare(password, c.hash))) throw new UnauthorizedException('La contraseña es incorrecta');
    if (!verificarTotp(decrypt(c.secreto), codigo)) throw new BadRequestException('El código no es correcto');
    await this.db.query('UPDATE clientes SET totp_activo = false, totp_secreto_cifrado = NULL WHERE id = $1', [clienteId]);
    await this.notificaciones.crear(clienteId, 'SEGURIDAD', 'Verificación en dos pasos desactivada', 'Ya no se pedirá un código al iniciar sesión.', '/seguridad');
    return { dosFactoresActivo: false };
  }

  // ------------------------------------------------------------- sesiones

  async sesiones(user: AuthUser) {
    const rows = await this.db.rows<{ id: string; userAgent: string | null; ip: string | null; createdAt: Date; lastSeenAt: Date }>(
      `SELECT id, user_agent AS "userAgent", ip, created_at AS "createdAt", last_seen_at AS "lastSeenAt"
         FROM sesiones WHERE cliente_id = $1 AND NOT revocada AND expires_at > now()
        ORDER BY last_seen_at DESC LIMIT 20`,
      [user.sub],
    );
    return rows.map((r) => ({ ...r, dispositivo: describirDispositivo(r.userAgent), actual: r.id === user.sid }));
  }

  async cerrarSesion(user: AuthUser, id: string) {
    const r = await this.db.query('UPDATE sesiones SET revocada = true WHERE id = $1 AND cliente_id = $2 AND NOT revocada', [id, user.sub]);
    if (!r.rowCount) throw new NotFoundException('Sesión no encontrada');
    return { ok: true };
  }

  async cerrarOtras(user: AuthUser) {
    const r = await this.db.query('UPDATE sesiones SET revocada = true WHERE cliente_id = $1 AND id <> $2 AND NOT revocada', [user.sub, user.sid ?? null]);
    return { cerradas: r.rowCount };
  }
}

function describirDispositivo(ua: string | null): string {
  if (!ua) return 'Dispositivo desconocido';
  const so = /Windows/i.test(ua) ? 'Windows' : /Android/i.test(ua) ? 'Android' : /iPhone|iPad|iOS/i.test(ua) ? 'iOS' : /Mac OS/i.test(ua) ? 'macOS' : /Linux/i.test(ua) ? 'Linux' : 'Sistema desconocido';
  const nav = /Edg\//i.test(ua) ? 'Edge' : /OPR\/|Opera/i.test(ua) ? 'Opera' : /Chrome\//i.test(ua) ? 'Chrome' : /Firefox\//i.test(ua) ? 'Firefox' : /Safari\//i.test(ua) ? 'Safari' : 'Navegador';
  return `${nav} en ${so}`;
}
