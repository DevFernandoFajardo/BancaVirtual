import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';

export const FRECUENCIAS = ['UNICA', 'SEMANAL', 'QUINCENAL', 'MENSUAL'] as const;
export type Frecuencia = (typeof FRECUENCIAS)[number];

export interface Programada {
  id: string;
  cuentaOrigenId: string;
  cuentaOrigenNumero: string;
  cuentaDestinoNumero: string;
  monto: number;
  descripcion: string;
  frecuencia: Frecuencia;
  proximaEjecucion: string;
  /** HH:MM, hora de Guatemala */
  hora: string;
  estado: 'ACTIVA' | 'PAUSADA' | 'COMPLETADA' | 'CANCELADA';
  ultimaEjecucion: Date | null;
  ultimoError: string | null;
  createdAt: Date;
}

export class CrearProgramadaDto {
  @IsUUID()
  cuentaOrigenId: string;

  @IsString()
  @Matches(/^\d{10}$/, { message: 'El número de cuenta destino debe tener 10 dígitos' })
  cuentaDestinoNumero: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(1_000_000)
  monto: number;

  @IsOptional()
  @IsString()
  @MaxLength(140)
  descripcion?: string;

  @IsIn([...FRECUENCIAS])
  frecuencia: Frecuencia;

  /** Fecha de la primera ejecución, YYYY-MM-DD (hora de Guatemala) */
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'fecha debe tener formato YYYY-MM-DD' })
  fecha: string;

  /** Hora de envío, HH:MM (hora de Guatemala). Si no se indica: ahora si la fecha es hoy, o las 08:00 */
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'hora debe tener formato HH:MM' })
  hora?: string;
}
