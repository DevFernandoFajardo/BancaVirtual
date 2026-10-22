import { api } from '@/lib/api';
import type { EstadoDeCuenta, FiltroMovimientos, LiquidacionPlazo, Cuenta, Movimiento, Paginado } from '@/interfaces/cuenta.interface';
import type {
  Beneficiario,
  ComprobanteGuardado,
  ComprobantePago,
  ComprobantePrestamo,
  ConsultaServicio,
  CrearProgramadaRequest,
  ModoServicios,
  Notificacion,
  PagoServicio,
  Prestamo,
  PrestamoDetalle,
  Programada,
  Servicio,
  Sesion,
  Tarjeta,
  TarjetaDetalle,
  TipoCambio,
} from '@/interfaces/banca.interface';

function qs(obj: Record<string, string | number | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) if (v !== undefined && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}

export const estadoCuentaService = {
  movimientos: (id: string, f: FiltroMovimientos, page = 1, limit = 15) =>
    api<Paginado<Movimiento>>(`/cuentas/${id}/movimientos${qs({ ...f, page, limit })}`),
  estado: (id: string, desde?: string, hasta?: string) => api<EstadoDeCuenta>(`/cuentas/${id}/estado-cuenta${qs({ desde, hasta })}`),
  constituirPlazoFijo: (cuentaOrigenId: string, monto: number, plazoMeses: number) =>
    api<Cuenta>('/cuentas/plazo-fijo', { method: 'POST', body: { cuentaOrigenId, monto, plazoMeses } }),
  liquidarPlazoFijo: (id: string, cuentaDestinoId: string) =>
    api<LiquidacionPlazo>(`/cuentas/${id}/liquidar`, { method: 'POST', body: { cuentaDestinoId } }),
  comprobante: (referencia: string) => api<ComprobanteGuardado>(`/transferencias/comprobante/${encodeURIComponent(referencia)}`),
};

export const beneficiariosService = {
  listar: () => api<Beneficiario[]>('/beneficiarios'),
  crear: (alias: string, cuentaNumero: string) => api<Beneficiario>('/beneficiarios', { method: 'POST', body: { alias, cuentaNumero } }),
  eliminar: (id: string) => api<{ ok: true }>(`/beneficiarios/${id}`, { method: 'DELETE' }),
};

export const programadasService = {
  listar: () => api<Programada[]>('/programadas'),
  crear: (data: CrearProgramadaRequest) => api<Programada>('/programadas', { method: 'POST', body: data }),
  pausar: (id: string) => api<Programada>(`/programadas/${id}/pausar`, { method: 'POST' }),
  reanudar: (id: string) => api<Programada>(`/programadas/${id}/reanudar`, { method: 'POST' }),
  cancelar: (id: string) => api<Programada>(`/programadas/${id}`, { method: 'DELETE' }),
};

export const serviciosService = {
  catalogo: () => api<Servicio[]>('/servicios'),
  pagar: (data: { servicioCodigo: string; contrato: string; monto: number; cuentaId: string }) =>
    api<ComprobantePago>('/servicios/pagar', { method: 'POST', body: data }),
  historial: (page = 1, limit = 10) => api<Paginado<PagoServicio>>(`/servicios/pagos?page=${page}&limit=${limit}`),
  modo: () => api<ModoServicios>('/servicios/modo'),
  consultar: (servicioCodigo: string, contrato: string) =>
    api<ConsultaServicio>('/servicios/consultar', { method: 'POST', body: { servicioCodigo, contrato } }),
};

export const prestamosService = {
  listar: () => api<Prestamo[]>('/prestamos'),
  detalle: (id: string) => api<PrestamoDetalle>(`/prestamos/${id}`),
  /** Paga las próximas N cuotas pendientes con el saldo de una cuenta */
  pagar: (id: string, cuentaId: string, cuotas: number) =>
    api<ComprobantePrestamo>(`/prestamos/${id}/pagar`, { method: 'POST', body: { cuentaId, cuotas } }),
};

export const tarjetasService = {
  listar: () => api<Tarjeta[]>('/tarjetas'),
  detalle: (id: string) => api<TarjetaDetalle>(`/tarjetas/${id}`),
  bloquear: (id: string) => api<Tarjeta>(`/tarjetas/${id}/bloquear`, { method: 'POST' }),
  desbloquear: (id: string) => api<Tarjeta>(`/tarjetas/${id}/desbloquear`, { method: 'POST' }),
  pagar: (id: string, cuentaId: string, monto: number) =>
    api<{ referencia: string; monto: number }>(`/tarjetas/${id}/pagar`, { method: 'POST', body: { cuentaId, monto } }),
  consumoDemo: (id: string, monto: number, comercio?: string) =>
    api<TarjetaDetalle>(`/tarjetas/${id}/consumo-demo`, { method: 'POST', body: { monto, comercio } }),
};

export const notificacionesService = {
  listar: () => api<{ items: Notificacion[]; noLeidas: number }>('/notificaciones'),
  resumen: () => api<{ noLeidas: number }>('/notificaciones/resumen'),
  leer: (id: string) => api<{ ok: true }>(`/notificaciones/${id}/leer`, { method: 'POST' }),
  leerTodas: () => api<{ ok: true }>('/notificaciones/leer-todas', { method: 'POST' }),
};

export const seguridadService = {
  estado: () => api<{ dosFactoresActivo: boolean; sesionesActivas: number }>('/seguridad/estado'),
  cambiarPassword: (passwordActual: string, passwordNueva: string) =>
    api<{ ok: true }>('/seguridad/password', { method: 'POST', body: { passwordActual, passwordNueva } }),
  iniciar2fa: () => api<{ secreto: string; otpauthUrl: string }>('/seguridad/2fa/iniciar', { method: 'POST' }),
  activar2fa: (codigo: string) => api<{ dosFactoresActivo: true }>('/seguridad/2fa/activar', { method: 'POST', body: { codigo } }),
  desactivar2fa: (password: string, codigo: string) =>
    api<{ dosFactoresActivo: false }>('/seguridad/2fa/desactivar', { method: 'POST', body: { password, codigo } }),
  sesiones: () => api<Sesion[]>('/seguridad/sesiones'),
  cerrarSesion: (id: string) => api<{ ok: true }>(`/seguridad/sesiones/${id}`, { method: 'DELETE' }),
  cerrarOtras: () => api<{ cerradas: number }>('/seguridad/sesiones/cerrar-otras', { method: 'POST' }),
};

export const extrasService = {
  tipoCambio: () => api<TipoCambio>('/extras/tipo-cambio'),
};

export const pushService = {
  config: () => api<{ habilitado: boolean; publicKey: string; dispositivos: number }>('/push/config'),
  suscribir: (s: { endpoint: string; keys: { p256dh: string; auth: string }; userAgent?: string }) =>
    api<{ ok: true }>('/push/suscribir', { method: 'POST', body: s }),
  quitar: (endpoint: string) => api<{ ok: true }>('/push/suscripcion', { method: 'DELETE', body: { endpoint } }),
  probar: () => api<{ ok: true }>('/push/probar', { method: 'POST' }),
};
