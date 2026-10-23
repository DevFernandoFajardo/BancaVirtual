export interface Beneficiario {
  id: string;
  alias: string;
  cuentaNumero: string;
  titular: string;
  createdAt: string;
}

export type Frecuencia = 'UNICA' | 'SEMANAL' | 'QUINCENAL' | 'MENSUAL';

export interface Programada {
  id: string;
  cuentaOrigenId: string;
  cuentaOrigenNumero: string;
  cuentaDestinoNumero: string;
  monto: number;
  descripcion: string;
  frecuencia: Frecuencia;
  proximaEjecucion: string;
  estado: 'ACTIVA' | 'PAUSADA' | 'COMPLETADA' | 'CANCELADA';
  ultimaEjecucion: string | null;
  ultimoError: string | null;
  createdAt: string;
}

export interface CrearProgramadaRequest {
  cuentaOrigenId: string;
  cuentaDestinoNumero: string;
  monto: number;
  descripcion?: string;
  frecuencia: Frecuencia;
  fecha: string;
}

export interface ComprobanteGuardado {
  referencia: string;
  estado: string;
  direccion: 'ENVIADA' | 'RECIBIDA';
  monto: number;
  moneda: string;
  descripcion: string;
  fecha: string;
  cuentaOrigen: string;
  cuentaDestino: string;
  titularOrigen: string;
  titularDestino: string;
}

export interface Servicio {
  codigo: string;
  nombre: string;
  categoria: string;
  referenciaEtiqueta: string;
}

export interface PagoServicio {
  id: string;
  referencia: string;
  servicioCodigo: string;
  servicio: string;
  contrato: string;
  monto: number;
  cuentaOrigen: string;
  fecha: string;
}

export interface ComprobantePago {
  referencia: string;
  servicio: string;
  contrato: string;
  monto: number;
  cuentaOrigen: string;
  saldoDespues: number;
  fecha: string;
  /** Número de autorización del proveedor externo (null en modo simulado) */
  autorizacion?: string | null;
  proveedor?: string | null;
}

export interface Tarjeta {
  id: string;
  productoNombre: string;
  ultimos4: string;
  titular: string;
  vencimiento: string;
  limite: number;
  saldoUtilizado: number;
  disponible: number;
  estado: 'ACTIVA' | 'BLOQUEADA';
  /** Quién la bloqueó: el propio cliente (puede desbloquear) o el banco (no puede) */
  bloqueadaPor?: 'CLIENTE' | 'BANCO' | null;
  /** Fecha de corte y de pago que informa CP Gestiones (fecha ISO o día del mes) */
  fechaCorte?: string | null;
  fechaPago?: string | null;
  createdAt: string;
}

export interface MovimientoTarjeta {
  id: string;
  tipo: 'CONSUMO' | 'PAGO';
  monto: number;
  descripcion: string;
  fecha: string;
}

export interface TarjetaDetalle extends Tarjeta {
  movimientos: MovimientoTarjeta[];
}

export type TipoNotificacion = 'GESTION' | 'MOVIMIENTO' | 'PAGO' | 'TARJETA' | 'SEGURIDAD' | 'BANCO';

export interface Notificacion {
  id: string;
  tipo: TipoNotificacion;
  titulo: string;
  mensaje: string;
  enlace: string | null;
  leida: boolean;
  createdAt: string;
}

export interface Sesion {
  id: string;
  dispositivo: string;
  ip: string | null;
  createdAt: string;
  lastSeenAt: string;
  actual: boolean;
}

export interface TipoCambio {
  base: string;
  referencial: boolean;
  actualizado: string;
  tasas: { moneda: string; nombre: string; compra: number; venta: number }[];
}

// ---------------------------------------------------------------- Préstamos
export interface CuotaPrestamo {
  numero: number;
  vence: string;
  capital: number;
  interes: number;
  total: number;
  estado: 'PENDIENTE' | 'PAGADA';
  pagadaAt: string | null;
}

export interface Prestamo {
  id: string;
  numero: string;
  productoCodigo: string;
  productoNombre: string;
  monto: number;
  tasaAnual: number;
  cuotasTotal: number;
  cuotasPagadas: number;
  cuotasPendientes: number;
  cuotaMonto: number;
  saldoCapital: number;
  estado: 'VIGENTE' | 'LIQUIDADO';
  proximaCuota: { numero: number; vence: string; total: number } | null;
  createdAt: string;
}

export interface PrestamoDetalle extends Prestamo {
  cuotas: CuotaPrestamo[];
}

export interface ComprobantePrestamo {
  referencia: string;
  prestamo: string;
  producto: string;
  cuotasPagadas: number;
  desdeCuota: number;
  hastaCuota: number;
  monto: number;
  cuentaOrigen: string;
  saldoCuenta: number;
  saldoPrestamo: number;
  cuotasPendientes: number;
  liquidado: boolean;
  fecha: string;
}

export interface ModoServicios {
  externo: boolean;
  proveedor: string;
}

export interface ConsultaServicio {
  disponible: boolean;
  titular?: string;
  montoAdeudado?: number;
  detalle?: string;
}
