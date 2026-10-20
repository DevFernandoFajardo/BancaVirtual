import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GatewayTimeoutException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { randomUUID } from 'crypto';

export interface CpOpciones {
  /** Query string */
  params?: Record<string, string | number | undefined>;
  /** token_cliente de la sesión (solo endpoints de sesión y seguridad) */
  clienteToken?: string;
  /** Clave de idempotencia; si no se envía en una escritura se genera una nueva */
  idempotencyKey?: string;
  /** Login, logout, cambio de contraseña y revocar sesión NO llevan Idempotency-Key */
  sinClave?: boolean;
}

/** Códigos de error de CP Gestiones que sí son del cliente final y se muestran tal cual. */
const CODIGOS_DE_CLIENTE_401 = new Set(['INVALID_CREDENTIALS', 'CUSTOMER_SESSION_EXPIRED']);

/**
 * Único punto de contacto con CP Gestiones (la API del banco).
 * El token de integración vive solo en el servidor (variable CP_GESTIONES_TOKEN): jamás se envía al navegador.
 */
@Injectable()
export class CpClient {
  private readonly logger = new Logger(CpClient.name);
  private readonly http: AxiosInstance;

  constructor(config: ConfigService) {
    const token = config.get<string>('CP_GESTIONES_TOKEN') ?? '';
    if (!token) this.logger.warn('CP_GESTIONES_TOKEN está vacío: las operaciones bancarias fallarán.');
    this.http = axios.create({
      baseURL: (config.get<string>('CP_GESTIONES_BASE_URL') ?? 'https://cp-gestiones-api.onrender.com/api/v1').replace(/\/+$/, ''),
      // El servidor gratuito puede tardar en despertar: la guía recomienda al menos 60 s
      timeout: Number(config.get('CP_GESTIONES_TIMEOUT_MS') ?? 65_000),
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
  }

  /** Clave de idempotencia nueva (8-120 caracteres de A-Z a-z 0-9 _ . : -) */
  static clave(prefijo = 'bv'): string {
    return `${prefijo}-${randomUUID()}`;
  }

  get<T = any>(path: string, o: CpOpciones = {}): Promise<T> {
    return this.enviar<T>('GET', path, undefined, o);
  }

  post<T = any>(path: string, body?: unknown, o: CpOpciones = {}): Promise<T> {
    return this.enviar<T>('POST', path, body ?? {}, o);
  }

  patch<T = any>(path: string, body?: unknown, o: CpOpciones = {}): Promise<T> {
    return this.enviar<T>('PATCH', path, body ?? {}, o);
  }

  private async enviar<T>(method: 'GET' | 'POST' | 'PATCH', path: string, body: unknown, o: CpOpciones): Promise<T> {
    const headers: Record<string, string> = {};
    if (o.clienteToken) headers['X-Cliente-Token'] = o.clienteToken;
    // Una sola clave por operación: si hay un reintento por timeout se repite con la MISMA clave
    const clave = method !== 'GET' && !o.sinClave ? (o.idempotencyKey ?? CpClient.clave()) : undefined;
    if (method !== 'GET') headers['Content-Type'] = 'application/json';
    if (clave) headers['Idempotency-Key'] = clave;
    const conClave = !!clave;

    for (let intento = 0; ; intento++) {
      try {
        const res = await this.http.request({ method, url: path, data: body, params: o.params, headers });
        const payload = res.data;
        if (payload && typeof payload === 'object' && 'ok' in payload) {
          if (payload.ok === false) throw this.errorDe(res.status, payload);
          return payload.data as T;
        }
        return payload as T;
      } catch (err) {
        const reintentable =
          axios.isAxiosError(err) &&
          (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT' || err.code === 'ECONNRESET' || err.response?.status === 503);
        if (reintentable && intento < 1 && (method === 'GET' || conClave)) continue;
        if (err instanceof HttpException) throw err;
        throw this.mapear(err);
      }
    }
  }

  private mapear(err: unknown): Error {
    if (!axios.isAxiosError(err)) {
      this.logger.error(`Error inesperado llamando a CP Gestiones: ${String(err)}`);
      return new BadGatewayException('No se pudo comunicar con el banco');
    }
    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
      return new GatewayTimeoutException('El banco tardó demasiado en responder. Inténtalo de nuevo en un momento.');
    }
    if (!err.response) {
      this.logger.error(`CP Gestiones sin respuesta: ${err.code ?? err.message}`);
      return new BadGatewayException('No se pudo comunicar con el banco');
    }
    return this.errorDe(err.response.status, err.response.data);
  }

  private errorDe(status: number, data: any): Error {
    let mensaje: string = typeof data?.message === 'string' && data.message ? data.message : 'No se pudo completar la operación';
    // En 422 la guía pide mostrar `message`; si hay detalle por campo se agrega para que el usuario sepa qué corregir
    if (status === 422 && data?.errors && typeof data.errors === 'object') {
      const detalle = Object.values(data.errors as Record<string, unknown>)
        .flat()
        .filter((v): v is string => typeof v === 'string')
        .slice(0, 3)
        .join(' ');
      if (detalle) mensaje = `${mensaje} ${detalle}`.trim();
    }
    const code: string | undefined = data?.code;
    const cuerpo = { message: mensaje, code, errors: data?.errors };

    if (status === 401) {
      if (code && CODIGOS_DE_CLIENTE_401.has(code)) return new UnauthorizedException(cuerpo);
      // 401 con el token de integración: problema del servidor, no del cliente final
      this.logger.error(`CP Gestiones respondió 401 (${code ?? 'sin código'}): revisa CP_GESTIONES_TOKEN`);
      return new BadGatewayException('El banco no está disponible en este momento');
    }
    if (status === 400) return new BadRequestException(cuerpo);
    if (status === 403) return new ForbiddenException(cuerpo);
    if (status === 404) return new NotFoundException(cuerpo);
    if (status === 409) return new ConflictException(cuerpo);
    if (status === 422) return new UnprocessableEntityException(cuerpo);
    if (status === 429) return new HttpException({ message: 'Demasiadas solicitudes, espera un momento e inténtalo de nuevo', code }, 429);
    this.logger.error(`CP Gestiones respondió ${status} (${code ?? 'sin código'})`);
    return new BadGatewayException('El banco no está disponible en este momento');
  }
}

/** Importes de CP: texto "150.25" (sin comas) a partir de un número. */
export const importe = (n: number): string => n.toFixed(2);
export const desdeCentavos = (c: number | string | null | undefined): string => (Number(c ?? 0) / 100).toFixed(2);
