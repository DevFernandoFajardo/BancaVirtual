export type TipoCuenta = 'AHORRO' | 'MONETARIA' | 'PLAZO_FIJO';

export interface Cuenta {
  id: string;
  numero: string;
  tipo: TipoCuenta;
  moneda: string;
  /** La API envía el saldo como texto decimal ("1000.50") para no perder precisión */
  saldo: string;
  estado: 'ACTIVA' | 'BLOQUEADA' | 'CERRADA';
  alias: string | null;
  clienteId: string;
  createdAt: string;
  /** Solo plazo fijo */
  plazoMeses: number | null;
  tasaAnual: string | null;
  capitalInicial: string | null;
  fechaVencimiento: string | null;
}

export interface Movimiento {
  id: string;
  cuentaId: string;
  tipo: 'DEBITO' | 'CREDITO';
  monto: string;
  saldoPosterior: string;
  descripcion: string;
  referencia: string | null;
  createdAt: string;
}

export interface Paginado<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface AbrirCuentaRequest {
  tipo: 'AHORRO' | 'MONETARIA';
  alias?: string;
}

export interface CuentaDestino {
  numero: string;
  tipo: TipoCuenta;
  moneda: string;
  /** Nombre con el apellido enmascarado, p. ej. "Luis P****" */
  titular: string;
}

export interface FiltroMovimientos {
  desde?: string;
  hasta?: string;
  tipo?: 'DEBITO' | 'CREDITO' | '';
  q?: string;
}

export interface EstadoDeCuenta {
  cuenta: Cuenta;
  titular: string;
  periodo: { desde: string; hasta: string };
  saldoInicial: string;
  saldoFinal: string;
  totalCreditos: string;
  totalDebitos: string;
  movimientos: Movimiento[];
  generadoEn: string;
}

export interface LiquidacionPlazo {
  vencido: boolean;
  capital: string;
  intereses: string;
  total: string;
  destino: string;
}
