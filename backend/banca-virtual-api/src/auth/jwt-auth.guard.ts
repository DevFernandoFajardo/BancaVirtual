import {
  applyDecorators,
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ApiBearerAuth, ApiSecurity } from '@nestjs/swagger';
import { safeEqual } from '../common/crypto.util';
import { DatabaseService } from '../database/database.service';
import { AuthUser, Rol } from './auth.schema';

const ROLES_KEY = 'roles';

/**
 * Acepta dos formas de autenticación:
 *  - Authorization: Bearer <jwt>   -> clientes (y admins humanos)
 *  - X-Service-Key: <llave>        -> la app administrativa (rol ADMIN)
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly db: DatabaseService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();

    const serviceKey = req.headers['x-service-key'];
    if (typeof serviceKey === 'string' && serviceKey.length > 0) {
      const expected = this.config.get<string>('SERVICE_API_KEY');
      if (expected && safeEqual(serviceKey, expected)) {
        req.user = { sub: 'service', rol: 'ADMIN' } satisfies AuthUser;
        return true;
      }
      throw new UnauthorizedException('Llave de servicio inválida');
    }

    const header: string | undefined = req.headers['authorization'];
    const [scheme, token] = (header ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException('Token requerido');

    try {
      const payload = await this.jwt.verifyAsync<AuthUser>(token);
      // Solo tokens de sesión completa (el "desafío" de 2FA lleva otro rol y no sirve aquí)
      if ((payload.rol !== 'CLIENTE' && payload.rol !== 'ADMIN') || !payload.sid) throw new Error('token sin sesión');

      const sesion = await this.db.one<{ revocada: boolean; vencida: boolean; vista: boolean }>(
        `SELECT revocada, expires_at < now() AS vencida, last_seen_at > now() - interval '1 minute' AS vista
           FROM sesiones WHERE id = $1 AND cliente_id = $2`,
        [payload.sid, payload.sub],
      );
      if (!sesion || sesion.revocada || sesion.vencida) throw new Error('sesión cerrada');
      if (!sesion.vista) await this.db.query('UPDATE sesiones SET last_seen_at = now() WHERE id = $1', [payload.sid]);

      req.user = { sub: payload.sub, rol: payload.rol, sid: payload.sid } satisfies AuthUser;
      return true;
    } catch {
      throw new UnauthorizedException('Token inválido, expirado o sesión cerrada');
    }
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Rol[]>(ROLES_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (!roles || roles.length === 0) return true;
    const user: AuthUser | undefined = ctx.switchToHttp().getRequest().user;
    if (!user || !roles.includes(user.rol)) throw new ForbiddenException('No tienes permiso para esta operación');
    return true;
  }
}

/** Protege una ruta o controlador: autenticación + rol requerido. */
export const Auth = (...roles: Rol[]) =>
  applyDecorators(
    SetMetadata(ROLES_KEY, roles),
    UseGuards(JwtAuthGuard, RolesGuard),
    ApiBearerAuth(),
    ...(roles.includes('ADMIN') ? [ApiSecurity('service-key')] : []),
  );

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user;
});
