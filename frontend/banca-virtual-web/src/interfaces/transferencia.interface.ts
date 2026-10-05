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
