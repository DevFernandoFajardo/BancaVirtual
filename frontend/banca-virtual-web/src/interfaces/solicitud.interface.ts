export type Semaforo = 'VERDE' | 'AMARILLO' | 'ROJO' | string;

export type EstadoSolicitud =
  | 'EN_EVALUACION'
  | 'PENDIENTE_DECISION_CLIENTE'
  | 'RECHAZADA_POR_POLITICAS'
  | 'RECHAZADA_POR_CLIENTE'
  | 'ACEPTADA'
  | 'EMITIDA'
  | 'CANCELADA';

export interface PoliticaEvaluada {
  nombre: string;
  resultado: Semaforo;
  detalle: string;
}

export interface Solicitud {
  id: string;
  clienteId: string;
  productoCodigo: string;
  productoNombre: string | null;
  /** Id de la evaluación en el CORE (CreditPulse) */
  evaluacionId: number;
  /** true mientras dura la espera: el resultado todavía no se muestra */
  enEvaluacion: boolean;
  segundosRestantes: number;
  /** null mientras se evalúa; luego true (aprobada) o false (no aprobada) */
  aprobada: boolean | null;
  resultadoGeneral: Semaforo | null;
  resultadoEtiqueta: string | null;
  /** true cuando el cliente todavía puede aceptar o rechazar */
  puedeDecidir: boolean;
  /** Solo la app administrativa recibe el detalle; al cliente le llega vacío */
  politicas: PoliticaEvaluada[];
  estado: EstadoSolicitud;
  decisionClienteAt: string | null;
  notaAdmin: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Campos del formulario = campos de POST /evaluaciones del CORE */
export interface CrearSolicitudRequest {
  productoCodigo: string;
  primerNombre: string;
  primerApellido: string;
  dpi: string;
  nit: string;
  fechaNacimiento: string;
  ingresosMensuales: number;
  tipoEmpleo: string;
  antiguedadLaboralMeses: number;
}

export interface ProductoCatalogo {
  codigo: string;
  categoria: 'Tarjetas' | 'Créditos' | 'Precalificación';
  nombre: string;
  descripcion: string;
}
