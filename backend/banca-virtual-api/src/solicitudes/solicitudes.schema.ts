import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { CorePolitica } from '../core/core.types';

export const ESTADOS_SOLICITUD = [
  'EN_EVALUACION', //              enviada al CORE; el resultado se muestra al cliente cuando pasa la espera
  'PENDIENTE_DECISION_CLIENTE', // el CORE aprobó/dio condiciones y el cliente debe decidir
  'RECHAZADA_POR_POLITICAS', //    el CORE la rechazó (semáforo ROJO)
  'RECHAZADA_POR_CLIENTE', //      el cliente decidió no continuar
  'ACEPTADA', //                   el cliente aceptó; espera la gestión administrativa
  'EMITIDA', //                    la app administrativa confirmó la emisión del producto
  'CANCELADA', //                  cancelada por administración
] as const;
export type EstadoSolicitud = (typeof ESTADOS_SOLICITUD)[number];

/** Estados que bloquean una nueva solicitud del mismo producto */
export const ESTADOS_VIGENTES: EstadoSolicitud[] = ['EN_EVALUACION', 'PENDIENTE_DECISION_CLIENTE', 'ACEPTADA', 'EMITIDA'];

export interface Solicitud {
  id: string;
  clienteId: string;
  productoCodigo: string;
  productoNombre: string | null;
  evaluacionId: number;
  resultadoGeneral: string;
  resultadoEtiqueta: string | null;
  politicas: CorePolitica[];
  sib: Record<string, unknown> | null;
  estado: EstadoSolicitud;
  resultadoVisibleAt: Date;
  decisionClienteAt: Date | null;
  notaAdmin: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const SOLICITUD_COLS = `
  id, cliente_id AS "clienteId", producto_codigo AS "productoCodigo", producto_nombre AS "productoNombre",
  evaluacion_id AS "evaluacionId", resultado_general AS "resultadoGeneral",
  resultado_etiqueta AS "resultadoEtiqueta", politicas, sib, estado,
  resultado_visible_at AS "resultadoVisibleAt",
  decision_cliente_at AS "decisionClienteAt", nota_admin AS "notaAdmin",
  created_at AS "createdAt", updated_at AS "updatedAt"`;

export class CrearSolicitudDto {
  /** Código del producto en el CORE, p. ej. TARJETA_CREDITO */
  @IsString()
  @Matches(/^[A-Z0-9_]{3,40}$/, { message: 'productoCodigo inválido' })
  productoCodigo: string;

  // Datos del solicitante: se envían tal cual al CORE (POST /evaluaciones)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  primerNombre: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  primerApellido: string;

  @Matches(/^\d{13}$/, { message: 'El DPI debe tener 13 dígitos' })
  dpi: string;

  @IsString()
  @Matches(/^[0-9]{1,12}(-?[0-9Kk])?$/, { message: 'NIT inválido' })
  nit: string;

  @IsDateString()
  fechaNacimiento: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100_000_000)
  ingresosMensuales: number;

  @IsString()
  @MaxLength(40)
  tipoEmpleo: string;

  @IsInt()
  @Min(0)
  @Max(1200)
  antiguedadLaboralMeses: number;

}

export class DecisionDto {
  @IsBoolean()
  aceptar: boolean;
}

export class CambiarEstadoDto {
  @IsIn(['EMITIDA', 'CANCELADA'])
  estado: 'EMITIDA' | 'CANCELADA';

  @IsOptional()
  @IsString()
  @MaxLength(300)
  nota?: string;
}

export class FiltroSolicitudesDto {
  @IsOptional()
  @IsIn([...ESTADOS_SOLICITUD])
  estado?: EstadoSolicitud;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  productoCodigo?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
