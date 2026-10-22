import { Type } from 'class-transformer';
import { IsInt, IsUUID, Max, Min } from 'class-validator';

/** Condiciones de referencia por producto de crédito (las mismas que usa el simulador de la web). */
export const CONDICIONES_CREDITO: Record<string, { tasa: number; plazoMax: number; plazoDef: number; montoDef: number }> = {
  CREDITO_PERSONAL: { tasa: 18, plazoMax: 60, plazoDef: 36, montoDef: 30_000 },
  CREDITO_VEHICULAR: { tasa: 12.5, plazoMax: 84, plazoDef: 60, montoDef: 120_000 },
  PRESTAMO_HIPOTECARIO: { tasa: 9.5, plazoMax: 300, plazoDef: 240, montoDef: 600_000 },
};

export const esCredito = (codigo: string) => codigo in CONDICIONES_CREDITO;

export class PagarPrestamoDto {
  /** Cuenta de la que se debita el pago */
  @IsUUID()
  cuentaId: string;

  /** Cuántas cuotas pagar (se pagan en orden: primero las más antiguas) */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(360)
  cuotas: number;
}
