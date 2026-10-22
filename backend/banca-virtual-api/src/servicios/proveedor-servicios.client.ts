import { BadGatewayException, Injectable, Logger, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

export interface ServicioProveedor {
  codigo: string;
  nombre: string;
  categoria: string;
  referenciaEtiqueta: string;
}

export interface ConsultaProveedor {
  titular?: string;
  montoAdeudado?: number;
  detalle?: string;
}

export interface PagoProveedor {
  autorizacion: string;
}

/**
 * Cliente de la API EXTERNA de pago de servicios (luz, agua, telefonía…). Contrato completo en docs/API-SERVICIOS-EXTERNA.md.
 * Variables: SERVICIOS_API_URL, SERVICIOS_API_KEY (Bearer), SERVICIOS_API_TIMEOUT_MS (20000 por omisión).
 * Si SERVICIOS_API_URL no está definida, `activo` es false y el módulo usa el catálogo local simulado.
 */
@Injectable()
export class ProveedorServiciosClient {
  private readonly logger = new Logger(ProveedorServiciosClient.name);
  private readonly http: AxiosInstance | null;
  readonly nombre: string;

  constructor(config: ConfigService) {
    const base = (config.get<string>('SERVICIOS_API_URL') ?? '').trim().replace(/\/+$/, '');
    const key = (config.get<string>('SERVICIOS_API_KEY') ?? '').trim();
    this.nombre = (config.get<string>('SERVICIOS_API_NOMBRE') ?? 'API-SERVICIOS').trim();
    this.http = base
      ? axios.create({
          baseURL: base,
          timeout: Number(config.get('SERVICIOS_API_TIMEOUT_MS') ?? 20_000),
          headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}`, 'X-Api-Key': key } : {}) },
        })
      : null;
  }

  get activo() {
    return !!this.http;
  }

  async catalogo(): Promise<ServicioProveedor[]> {
    const r = await this.llamar<any>('GET', '/servicios');
    const lista: any[] = Array.isArray(r) ? r : (r?.servicios ?? r?.items ?? []);
    return lista
      .map((s) => ({
        codigo: String(s.codigo ?? s.code ?? '').trim().slice(0, 30),
        nombre: String(s.nombre ?? s.name ?? '').trim().slice(0, 80),
        categoria: String(s.categoria ?? s.category ?? 'Otros').trim().slice(0, 30),
        referenciaEtiqueta: String(s.referencia_etiqueta ?? s.referenciaEtiqueta ?? 'Número de contrato').trim().slice(0, 40),
      }))
      .filter((s) => s.codigo && s.nombre);
  }

  /** Consulta cuánto debe el contrato. Devuelve null si el proveedor no ofrece consultas (404/405/501). */
  async consultar(servicio: string, contrato: string): Promise<ConsultaProveedor | null> {
    try {
      const r = await this.llamar<any>('POST', '/consultas', { servicio, contrato });
      const monto = Number(r?.monto_adeudado ?? r?.montoAdeudado ?? r?.monto);
      return {
        titular: r?.titular ?? r?.nombre ?? undefined,
        montoAdeudado: Number.isFinite(monto) && monto > 0 ? monto : undefined,
        detalle: r?.detalle ?? r?.descripcion ?? undefined,
      };
    } catch (err: any) {
      if ([404, 405, 501].includes(err?.status)) return null;
      throw err;
    }
  }

  /** Ejecuta el pago. `referencia` es la referencia del banco y sirve de Idempotency-Key (un reintento no cobra dos veces). */
  async pagar(p: { servicio: string; contrato: string; monto: number; referencia: string }): Promise<PagoProveedor> {
    const body = { servicio: p.servicio, contrato: p.contrato, monto: p.monto, referencia_banco: p.referencia };
    let r: any;
    try {
      r = await this.llamar('POST', '/pagos', body, p.referencia);
    } catch (err: any) {
      if (err?.status === 503) r = await this.llamar('POST', '/pagos', body, p.referencia); // un reintento seguro (misma clave)
      else throw err;
    }
    const estado = String(r?.estado ?? 'APROBADO').toUpperCase();
    if (['RECHAZADO', 'RECHAZADA', 'FALLIDO', 'ERROR'].includes(estado)) {
      throw new UnprocessableEntityException(String(r?.mensaje ?? r?.motivo ?? 'El proveedor rechazó el pago'));
    }
    return { autorizacion: String(r?.autorizacion ?? r?.referencia_proveedor ?? r?.id ?? p.referencia).slice(0, 80) };
  }

  /** Mejor esfuerzo: avisa al proveedor que anule un pago cuyo resultado quedó incierto (timeout). */
  async reversar(referencia: string): Promise<void> {
    try {
      await this.llamar('POST', '/pagos/reversa', { referencia_banco: referencia }, `rev-${referencia}`);
    } catch (err: any) {
      this.logger.warn(`No se pudo reversar ${referencia} en el proveedor: ${err?.message}`);
    }
  }

  private async llamar<T>(metodo: 'GET' | 'POST', ruta: string, body?: unknown, idem?: string): Promise<T> {
    if (!this.http) throw new ServiceUnavailableException('La API de pago de servicios no está configurada');
    try {
      const r = await this.http.request({ method: metodo, url: ruta, data: body, headers: idem ? { 'Idempotency-Key': idem } : undefined });
      const d = r.data;
      return (d && typeof d === 'object' && 'data' in d ? d.data : d) as T;
    } catch (err: any) {
      const status: number | undefined = err?.response?.status;
      const d = err?.response?.data;
      const msg = String(d?.message ?? d?.mensaje ?? d?.error?.message ?? d?.error ?? '').slice(0, 200);
      this.logger.warn(`${metodo} ${ruta} → ${status ?? err?.code ?? 'sin respuesta'} ${msg}`);
      let e: Error;
      if (status && status >= 400 && status < 500 && status !== 408 && status !== 429) {
        e = new UnprocessableEntityException(msg || 'El proveedor rechazó la solicitud');
      } else if (status && status >= 500) {
        e = new BadGatewayException('El proveedor de servicios tuvo un problema. Intenta de nuevo en unos minutos.');
      } else {
        e = new ServiceUnavailableException('No se pudo conectar con el proveedor de servicios. Intenta de nuevo en unos minutos.');
      }
      (e as any).status = status === 503 || !status ? 503 : status; // para decidir reintentos arriba
      (e as any).incierto = !status || status === 408 || status >= 500; // el pago pudo haberse procesado
      throw e;
    }
  }
}
