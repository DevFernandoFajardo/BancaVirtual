import { ConflictException, HttpException, Injectable, Logger, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { Cliente } from '../clientes/clientes.schema';
import { ClientesService } from '../clientes/clientes.service';
import { blindIndex, decrypt, encrypt } from '../common/crypto.util';
import { verificarTotp } from '../common/totp.util';
import { CpAuthService } from '../cp/cp-auth.service';
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
/** Marcador de "sin contraseña local": no es un hash bcrypt válido, así que nadie puede entrar con él. */
const SIN_PASSWORD_LOCAL = '!cp-gestiones';
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
    private readonly cpAuth: CpAuthService,
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
    // CP Gestiones es la ÚNICA fuente de credenciales: el registro se hace allá (rechaza correo/DPI repetidos, aplica sus reglas de contraseña)
    await this.cpAuth.registrar({
      nombre: dto.primerNombre.trim(),
      apellido: dto.primerApellido.trim(),
      correo: email,
      password: dto.password,
      dpi: dto.dpi,
      fechaNacimiento: dto.fechaNacimiento,
    });
    // Aquí solo queda una "ficha" local sin contraseña (necesaria para cuentas, movimientos y solicitudes de este sistema)
    const cliente = await this.anclaLocal(email, {
      nombre: dto.primerNombre.trim(),
      apellido: dto.primerApellido.trim(),
      dpi: dto.dpi,
      fechaNacimiento: dto.fechaNacimiento,
      nit: dto.nit,
      ingresos: dto.ingresosMensuales,
      tipoEmpleo: dto.tipoEmpleo,
      antiguedad: dto.antiguedadLaboralMeses,
    });
    return this.emitirToken(cliente, meta);
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

    let cli = cliente;
    if (cli?.rol === 'ADMIN') {
      // Administradores de BancaVirtual: contraseña local
      const ok = await bcrypt.compare(dto.password, cli.passwordHash);
      if (!ok) {
        await this.registrarFallo(cli.id);
        throw new UnauthorizedException('Credenciales inválidas');
      }
    } else {
      cli = await this.validarEnCp(dto, cliente, meta);
    }

    await this.db.query('UPDATE clientes SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = $1', [cli!.id]);

    if (estado?.totpActivo) {
      const desafio = await this.jwt.signAsync({ sub: cli!.id, rol: '2FA' }, { expiresIn: 300 });
      return { requiere2fa: true as const, desafio };
    }
    return this.emitirToken(cli!, meta);
  }

  /**
   * Las credenciales de los clientes se validan SIEMPRE en CP Gestiones (no hay contraseña local).
   * Si el cliente existe en CP pero no aquí (p. ej. lo creó el banco en el panel), se crea su ficha local al primer ingreso.
   */
  private async validarEnCp(dto: LoginDto, local: Cliente | null, meta: MetaSesion): Promise<Cliente> {
    const email = dto.email.toLowerCase();
    let sesion;
    try {
      sesion = await this.cpAuth.login(email, dto.password, meta);
    } catch (err: any) {
      if (CpAuthService.codigoDe(err) === 'INVALID_CREDENTIALS') {
        if (local) await this.registrarFallo(local.id);
        throw new UnauthorizedException('Credenciales inválidas');
      }
      throw err; // CP caído, etc.: no se entra por la puerta de atrás
    }
    // La sesión de CP no se reutiliza (BancaVirtual maneja la suya): se cierra
    void this.cpAuth.cerrar(sesion.token_cliente);

    const c = sesion.cliente ?? {};
    return this.anclaLocal(email, {
      nombre: String(c.nombre ?? c.primer_nombre ?? local?.primerNombre ?? 'Cliente'),
      apellido: String(c.apellido ?? c.primer_apellido ?? local?.primerApellido ?? ''),
      dpi: typeof c.dpi === 'string' && /^\d{13}$/.test(c.dpi) ? c.dpi : undefined,
      fechaNacimiento: typeof c.fecha_nacimiento === 'string' ? c.fecha_nacimiento.slice(0, 10) : undefined,
      ingresos: Number(c.ingresos_mensuales_q ?? 0) || undefined,
      tipoEmpleo: c.tipo_empleo ?? undefined,
      antiguedad: Number(c.antiguedad_laboral_meses ?? 0) || undefined,
    });
  }

  /**
   * Ficha local del cliente (sin contraseña): la usan cuentas, transferencias y solicitudes de este sistema.
   * Se crea si no existe; si existe se completa lo que falte y se borra cualquier contraseña local antigua.
   */
  private async anclaLocal(
    email: string,
    d: { nombre: string; apellido: string; dpi?: string; fechaNacimiento?: string; nit?: string; ingresos?: number; tipoEmpleo?: string; antiguedad?: number },
  ): Promise<Cliente> {
    const existente = await this.clientes.buscarPorEmail(email);
    if (existente) {
      await this.db.query(`UPDATE clientes SET password_hash = $2, updated_at = now() WHERE id = $1 AND password_hash <> $2`, [existente.id, SIN_PASSWORD_LOCAL]);
      if (d.dpi && !existente.dpi) {
        await this.db
          .query('UPDATE clientes SET dpi_cifrado = $2, dpi_hash = $3 WHERE id = $1 AND dpi_hash IS NULL', [existente.id, encrypt(d.dpi), blindIndex(d.dpi)])
          .catch(() => undefined); // DPI ya usado por otra ficha: se ignora
      }
      if (d.fechaNacimiento && !existente.fechaNacimiento) {
        await this.db.query('UPDATE clientes SET fecha_nacimiento = $2 WHERE id = $1 AND fecha_nacimiento IS NULL', [existente.id, d.fechaNacimiento]).catch(() => undefined);
      }
      return this.clientes.obtener(existente.id);
    }
    try {
      const id = await this.db.transaction(async (tx) => {
        const row = await this.db.one<{ id: string }>(
          `INSERT INTO clientes (email, password_hash, rol, primer_nombre, primer_apellido, dpi_cifrado, dpi_hash, nit_cifrado,
                                 fecha_nacimiento, ingresos_mensuales, tipo_empleo, antiguedad_laboral_meses)
           VALUES ($1, $2, 'CLIENTE', $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
          [
            email,
            SIN_PASSWORD_LOCAL,
            d.nombre.slice(0, 80),
            (d.apellido || '-').slice(0, 80),
            d.dpi ? encrypt(d.dpi) : null,
            d.dpi ? blindIndex(d.dpi) : null,
            d.nit ? encrypt(d.nit) : null,
            d.fechaNacimiento ?? null,
            (d.ingresos ?? 0).toFixed(2),
            d.tipoEmpleo ?? null,
            d.antiguedad ?? 0,
          ],
          tx,
        );
        await this.cuentas.abrir(row!.id, 'AHORRO', 'Mi cuenta de ahorro', tx);
        return row!.id;
      });
      return await this.clientes.obtener(id);
    } catch (err: any) {
      // Dos ingresos simultáneos del mismo cliente: gana el primero
      if (err?.code === PG_UNIQUE_VIOLATION) {
        const ya = await this.clientes.buscarPorEmail(email);
        if (ya) return ya;
      }
      throw err;
    }
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
