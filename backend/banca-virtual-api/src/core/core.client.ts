import {
  BadGatewayException,
  GatewayTimeoutException,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError, AxiosInstance } from 'axios';
import { CoreEvaluacion, CoreEvaluacionRequest, CorePerfilSib } from './core.types';

/**
 * Único punto de contacto con el CORE (CreditPulse).
 * La X-Api-Key vive solo en el servidor: la app móvil nunca la ve.
 */
@Injectable()
export class CoreClient {
  private readonly logger = new Logger(CoreClient.name);
  private readonly http: AxiosInstance;

  constructor(config: ConfigService) {
    this.http = axios.create({
      baseURL: config.getOrThrow<string>('CORE_BASE_URL'),
      timeout: 20_000,
      headers: { 'X-Api-Key': config.get<string>('CORE_API_KEY') ?? '', Accept: 'application/json' },
    });
  }

  async evaluar(payload: CoreEvaluacionRequest): Promise<CoreEvaluacion> {
    return this.call(() => this.http.post<CoreEvaluacion>('/evaluaciones', payload));
  }

  async obtenerEvaluacion(evaluacionId: number): Promise<CoreEvaluacion> {
    return this.call(() => this.http.get<CoreEvaluacion>(`/evaluaciones/${evaluacionId}`));
  }

  async perfilSib(params: { dpi: string; nit: string; nombre: string }): Promise<CorePerfilSib> {
    return this.call(() => this.http.get<CorePerfilSib>('/sib/perfil', { params }));
  }

  private async call<T>(fn: () => Promise<{ data: T }>): Promise<T> {
    try {
      return (await fn()).data;
    } catch (err) {
      throw this.mapError(err);
    }
  }

  private mapError(err: unknown): Error {
    if (!axios.isAxiosError(err)) {
      this.logger.error(`Error inesperado llamando al CORE: ${String(err)}`);
      return new BadGatewayException('No se pudo comunicar con el motor de evaluaciones');
    }
    const e = err as AxiosError<any>;
    if (e.code === 'ECONNABORTED' || e.code === 'ETIMEDOUT') {
      return new GatewayTimeoutException('El motor de evaluaciones tardó demasiado en responder');
    }
    const status = e.response?.status;
    if (status === 400 || status === 422) {
      // Datos rechazados por validación del CORE: es útil devolverlos al cliente
      const detail = e.response?.data?.message ?? e.response?.data?.title ?? e.response?.data;
      return new UnprocessableEntityException({ message: 'El motor de evaluaciones rechazó los datos', detail });
    }
    if (status === 401 || status === 403) {
      // Problema nuestro (credenciales del servidor), no del cliente final
      this.logger.error(`El CORE respondió ${status}: revisa CORE_API_KEY`);
    } else {
      this.logger.error(`El CORE respondió ${status ?? e.code ?? 'sin respuesta'}`);
    }
    return new BadGatewayException('El motor de evaluaciones no está disponible en este momento');
  }
}
