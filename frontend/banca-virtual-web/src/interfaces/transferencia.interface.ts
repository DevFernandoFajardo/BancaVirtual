export interface CrearTransferenciaRequest {
  cuentaOrigenId: string;
  cuentaDestinoNumero: string;
  monto: number;
  descripcion?: string;
}

/** Comprobante devuelto al crear una transferencia */
export interface ComprobanteTransferencia {
  id: string;
  referencia: string;
  estado: 'COMPLETADA';
  monto: number;
  moneda: string;
  descripcion: string;
  cuentaOrigen: string;
  cuentaDestino: string;
  saldoOrigenDespues: number;
  fecha: string;
}

export interface TransferenciaHistorial {
  id: string;
  referencia: string;
  direccion: 'ENVIADA' | 'RECIBIDA';
  monto: number;
  moneda: string;
  descripcion: string;
  cuentaOrigen: string;
  cuentaDestino: string;
  estado: string;
  fecha: string;
}

export interface CrearTransferenciaCelularRequest {
  cuentaOrigenId: string;
  telefono: string;
  monto: number;
  descripcion?: string;
}

/** Envío a un celular que aún no está registrado: el dinero queda retenido hasta que alguien lo registre */
export interface EnvioPendienteCelular {
  pendiente: true;
  id: string;
  referencia: string;
  estado: 'PENDIENTE';
  monto: number;
  moneda: string;
  descripcion: string;
  telefono: string;
  cuentaOrigen: string;
  saldoOrigenDespues: number;
  expiraEn: string;
  fecha: string;
}

export type ResultadoTransferenciaCelular = (ComprobanteTransferencia & { pendiente: false }) | EnvioPendienteCelular;

export interface PendienteCelular {
  id: string;
  referencia: string;
  telefono: string;
  monto: number;
  moneda: string;
  descripcion: string;
  estado: 'PENDIENTE' | 'RECLAMADA' | 'DEVUELTA' | 'CANCELADA';
  expiraEn: string;
  resueltaEn: string | null;
  createdAt: string;
  cuentaOrigen: string;
}
