/** Tipos de las respuestas del motor de evaluaciones (CreditPulse). El CORE responde en PascalCase. */
export type SemaforoCore = 'VERDE' | 'AMARILLO' | 'ROJO' | string;

export interface CorePolitica {
  PoliticaId: number;
  Nombre: string;
  Resultado: SemaforoCore;
  Detalle: string;
  Orden: number;
}

export interface CoreEvaluacion {
  EvaluacionId: number;
  ProductoCodigo: string;
  ProductoNombre: string;
  ClienteNombreCompleto: string;
  Nit: string;
  Dpi: string;
  ResultadoGeneral: SemaforoCore;
  ResultadoGeneralEtiqueta: string;
  Politicas: CorePolitica[];
  Sib: { ScoreBuro: number; NivelEndeudamiento: number; EnListaNegra: boolean };
  FechaEvaluacion: string;
}

export interface CoreEvaluacionRequest {
  productoCodigo: string;
  primerNombre: string;
  primerApellido: string;
  nit: string;
  dpi: string;
  fechaNacimiento: string;
  ingresosMensuales: number;
  tipoEmpleo: string;
  antiguedadLaboralMeses: number;
}

export interface CorePerfilSib {
  Dpi: string;
  Nit: string;
  NombreCompleto: string;
  ScoreBuro: number;
  NivelEndeudamiento: number;
  IngresosReportados: number;
  CreditosActivos: number;
  CreditosCancelados: number;
  MorasUltimos12Meses: number;
  DiasMoraMaximo: number;
  EnListaNegra: boolean;
  [k: string]: unknown;
}
