import { Injectable } from '@nestjs/common';
import { CpClient } from './cp.client';

export interface CpPerfil {
  nombre: string;
  apellido: string;
  correo: string;
  password: string;
  dpi: string;
  fechaNacimiento: string;
}

export interface CpSesion {
  token_cliente: string;
  expires_in: number;
  cliente: Record<string, any>;
}

/** Perfiles de acceso y contraseñas: los valida CP Gestiones (la API del banco). */
@Injectable()
export class CpAuthService {
  constructor(private readonly cp: CpClient) {}

  static codigoDe(err: any): string | undefined {
    try {
      return err?.getResponse?.()?.code;
    } catch {
      return undefined;
    }
  }

  /** Crea el perfil de acceso (contrato v2). Si el DPI ya existe en el banco, CP lo vincula (mismo DPI, correo y fecha). */
  registrar(p: CpPerfil) {
    return this.cp.post(
      '/banca/registro',
      {
        nombre: p.nombre,
        apellido: p.apellido,
        correo_electronico: p.correo,
        contrasena: p.password,
        dpi: p.dpi,
        fecha_nacimiento: p.fechaNacimiento.slice(0, 10),
      },
      {},
    );
  }

  /** Valida correo y contraseña en CP. 401 INVALID_CREDENTIALS si no coinciden (CP bloquea 15 min tras 5 fallos). */
  login(correo: string, password: string, meta: { ip?: string; userAgent?: string } = {}): Promise<CpSesion> {
    return this.cp.post<CpSesion>(
      '/banca/auth/login',
      {
        correo_electronico: correo,
        contrasena: password,
        dispositivo: (meta.userAgent ?? '').slice(0, 120) || undefined,
        ip: (meta.ip ?? '').slice(0, 45) || undefined,
      },
      { sinClave: true },
    );
  }

  async cerrar(token: string) {
    await this.cp.post('/banca/auth/logout', {}, { clienteToken: token, sinClave: true }).catch(() => undefined);
  }

  /** Comprueba una contraseña abriendo y cerrando una sesión de prueba. */
  async verificarPassword(correo: string, password: string): Promise<boolean> {
    try {
      const s = await this.login(correo, password);
      await this.cerrar(s.token_cliente);
      return true;
    } catch (err: any) {
      if (CpAuthService.codigoDe(err) === 'INVALID_CREDENTIALS') return false;
      throw err;
    }
  }

  /** Cambia la contraseña en CP (valida la actual y aplica sus reglas). */
  async cambiarPassword(correo: string, actual: string, nueva: string) {
    const s = await this.login(correo, actual);
    try {
      await this.cp.post('/banca/auth/contrasena', { contrasena_actual: actual, contrasena_nueva: nueva }, { clienteToken: s.token_cliente, sinClave: true });
    } finally {
      await this.cerrar(s.token_cliente);
    }
  }
}
