import { ConflictException, HttpException, Injectable, Logger, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { Cliente } from '../clientes/clientes.schema';
import { ClientesService } from '../clientes/clientes.service';
import { blindIndex, decrypt } from '../common/crypto.util';
import { verificarTotp } from '../common/totp.util';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { CuentasService } from '../cuentas/cuentas.service';
import { DatabaseService, PG_UNIQUE_VIOLATION } from '../database/database.service';
import { AuthUser, LoginDto, RegisterDto } from './auth.schema';

export interface MetaSesion {
  ip?: string;
  userAgent?: string;
}

const MAX_INTENTOS = 5;
const MINUTOS_BLOQUEO = 15;

const BCRYPT_ROUNDS = 12;
// Hash falso para igualar el tiempo de respuesta cuando el correo no existe
const DUMMY_HASH = bcrypt.hashSync('contraseña-inexistente', BCRYPT_ROUNDS);

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly clientes: ClientesService,
    private readonly cuentas: CuentasService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly notificaciones: NotificacionesService,
  ) {}

  /** Crea el administrador inicial si no existe. */
  async onModuleInit() {
    const email = this.config.get<string>('SEED_ADMIN_EMAIL')?.toLowerCase();
    const password = this.config.get<string>('SEED_ADMIN_PASSWORD');
    if (!email || !password) return;
    if (await this.clientes.existeEmail(email)) return;
    await this.clientes.crearAdmin(email, await bcrypt.hash(password, BCRYPT_ROUNDS));
    this.logger.log(`Administrador inicial creado: ${email}`);
  }

  async register(dto: RegisterDto, meta: MetaSesion = {}) {
    const email = dto.email.toLowerCase();
    const dpiHash = blindIndex(dto.dpi);

    if (await this.clientes.existeEmail(email)) throw new ConflictException('El correo ya está registrado');
    if (await this.clientes.existeDpiHash(dpiHash)) throw new ConflictException('El DPI ya está registrado');

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    try {
      // Cliente + primera cuenta de ahorro en una sola transacción
      const cliente = await this.db.transaction(async (tx) => {
        const nuevo = await this.clientes.crear(tx, {
          email,
          passwordHash,
          primerNombre: dto.primerNombre.trim(),
          primerApellido: dto.primerApellido.trim(),
          dpi: dto.dpi,
          dpiHash,
          nit: dto.nit,
          fechaNacimiento: dto.fechaNacimiento,
          ingresosMensuales: dto.ingresosMensuales,
          tipoEmpleo: dto.tipoEmpleo,
          antiguedadLaboralMeses: dto.antiguedadLaboralMeses ?? 0,
        });
        await this.cuentas.abrir(nuevo.id, 'AHORRO', 'Mi cuenta de ahorro', tx);
        return nuevo;
      });
      return this.emitirToken(cliente, meta);
    } catch (err: any) {
      // Dos registros simultáneos con el mismo correo/DPI: la restricción UNIQUE de la BD decide
      if (err?.code === PG_UNIQUE_VIOLATION) throw new ConflictException('El correo o el DPI ya están registrados');
      throw err;
    }
  }

  /**
   * Login con bloqueo: tras 5 contraseñas incorrectas seguidas la cuenta se bloquea 15 minutos.
   * Si el cliente activó el segundo factor, devuelve un "desafío" (válido 5 min) en lugar del token.
   */
  async login(dto: LoginDto, meta: MetaSesion = {}) {
    const cliente = await this.clientes.buscarPorEmail(dto.email.toLowerCase());
    const estado = cliente
      ? await this.db.one<{ bloqueadoHasta: Date | null; totpActivo: boolean }>(
          `SELECT bloqueado_hasta AS "bloqueadoHasta", totp_activo AS "totpActivo" FROM clientes WHERE id = $1`,
          [cliente.id],
        )
      : null;

    if (estado?.bloqueadoHasta && estado.bloqueadoHasta.getTime() > Date.now()) {
      const min = Math.max(1, Math.ceil((estado.bloqueadoHasta.getTime() - Date.now()) / 60_000));
      throw new HttpException(`Cuenta bloqueada temporalmente por intentos fallidos. Inténtalo de nuevo en ${min} minuto(s).`, 423);
    }

    const ok = await bcrypt.compare(dto.password, cliente?.passwordHash ?? DUMMY_HASH);
    if (!cliente || !ok) {
      if (cliente) await this.registrarFallo(cliente.id);
      throw new UnauthorizedException('Credenciales inválidas');
    }

    await this.db.query('UPDATE clientes SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = $1', [cliente.id]);

    if (estado?.totpActivo) {
      const desafio = await this.jwt.signAsync({ sub: cliente.id, rol: '2FA' }, { expiresIn: 300 });
      return { requiere2fa: true as const, desafio };
    }
    return this.emitirToken(cliente, meta);
  }

  /** Segundo paso del login cuando el cliente tiene verificación en dos pasos. */
  async verificarDosFactores(desafio: string, codigo: string, meta: MetaSesion = {}) {
    let payload: { sub: string; rol: string };
    try {
      payload = await this.jwt.verifyAsync(desafio);
    } catch {
      throw new UnauthorizedException('El desafío venció, inicia sesión de nuevo');
    }
    if (payload.rol !== '2FA') throw new UnauthorizedException('Desafío inválido');

    const row = await this.db.one<{ secreto: string | null; bloqueadoHasta: Date | null }>(
      `SELECT totp_secreto_cifrado AS secreto, bloqueado_hasta AS "bloqueadoHasta" FROM clientes WHERE id = $1 AND totp_activo = true`,
      [payload.sub],
    );
    if (!row?.secreto) throw new UnauthorizedException('Desafío inválido');
    if (row.bloqueadoHasta && row.bloqueadoHasta.getTime() > Date.now()) {
      throw new HttpException('Cuenta bloqueada temporalmente por intentos fallidos.', 423);
    }
    if (!verificarTotp(decrypt(row.secreto), codigo)) {
      await this.registrarFallo(payload.sub);
      throw new UnauthorizedException('Código incorrecto');
    }
    await this.db.query('UPDATE clientes SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = $1', [payload.sub]);
    return this.emitirToken(await this.clientes.obtener(payload.sub), meta);
  }

  async logout(user: AuthUser) {
    if (user.sid) await this.db.query('UPDATE sesiones SET revocada = true WHERE id = $1', [user.sid]);
    return { ok: true };
  }

  private async registrarFallo(clienteId: string) {
    const r = await this.db.one<{ bloqueado: boolean }>(
      `UPDATE clientes SET
          intentos_fallidos = CASE WHEN intentos_fallidos + 1 >= $2 THEN 0 ELSE intentos_fallidos + 1 END,
          bloqueado_hasta   = CASE WHEN intentos_fallidos + 1 >= $2 THEN now() + make_interval(mins => $3) ELSE bloqueado_hasta END
        WHERE id = $1
        RETURNING (intentos_fallidos = 0) AS bloqueado`,
      [clienteId, MAX_INTENTOS, MINUTOS_BLOQUEO],
    );
    if (r?.bloqueado) {
      await this.notificaciones.crear(
        clienteId,
        'SEGURIDAD',
        'Cuenta bloqueada temporalmente',
        `Por seguridad, bloqueamos tu acceso ${MINUTOS_BLOQUEO} minutos tras ${MAX_INTENTOS} intentos fallidos. Si no fuiste tú, cambia tu contraseña.`,
        '/seguridad',
      );
    }
  }

  private async emitirToken(cliente: Cliente, meta: MetaSesion = {}) {
    const expiresIn = Number(this.config.get('JWT_EXPIRES_SECONDS') ?? 3600);
    const sesion = (await this.db.one<{ id: string }>(
      `INSERT INTO sesiones (cliente_id, user_agent, ip, expires_at)
       VALUES ($1, $2, $3, now() + make_interval(secs => $4)) RETURNING id`,
      [cliente.id, (meta.userAgent ?? '').slice(0, 300) || null, (meta.ip ?? '').slice(0, 64) || null, expiresIn],
    ))!;
    const accessToken = await this.jwt.signAsync({ sub: cliente.id, rol: cliente.rol, sid: sesion.id });
    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn,
      cliente: this.clientes.toPublic(cliente),
    };
  }
}
