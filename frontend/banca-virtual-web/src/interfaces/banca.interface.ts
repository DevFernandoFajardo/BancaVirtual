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
