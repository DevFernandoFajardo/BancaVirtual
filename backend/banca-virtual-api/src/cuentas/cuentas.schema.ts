import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';
import { PaginacionDto } from '../common/pagination.schema';

export type TipoCuenta = 'AHORRO' | 'MONETARIA' | 'PLAZO_FIJO';
export type EstadoCuenta = 'ACTIVA' | 'BLOQUEADA' | 'CERRADA';

export interface Cuenta {
  id: string;
  numero: string;
  tipo: TipoCuenta;
  moneda: string;
  saldo: string;
  estado: EstadoCuenta;
  alias: string | null;
  clienteId: string;
  createdAt: Date;
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
  createdAt: Date;
}

/** Columnas de `cuentas` con alias camelCase (saldo como texto para no perder precisión) */
export const CUENTA_COLS = `
  id, numero, tipo, moneda, saldo::text AS saldo, estado, alias,
  cliente_id AS "clienteId", created_at AS "createdAt",
  plazo_meses AS "plazoMeses", tasa_anual::text AS "tasaAnual", capital_inicial::text AS "capitalInicial",
  fecha_vencimiento AS "fechaVencimiento"`;

export const MOVIMIENTO_COLS = `
  id, cuenta_id AS "cuentaId", tipo, monto::text AS monto,
  saldo_posterior::text AS "saldoPosterior", descripcion, referencia, created_at AS "createdAt"`;

export class AbrirCuentaDto {
  @IsIn(['AHORRO', 'MONETARIA'])
  tipo: 'AHORRO' | 'MONETARIA';

  @IsOptional()
  @IsString()
  @MaxLength(40)
  alias?: string;
}

export class DepositoDemoDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(100_000)
  monto: number;
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Filtros del estado de cuenta (fechas en hora de Guatemala, formato YYYY-MM-DD). */
export class FiltroMovimientosDto extends PaginacionDto {
  @IsOptional()
  @Matches(FECHA, { message: 'desde debe tener formato YYYY-MM-DD' })
  desde?: string;

  @IsOptional()
  @Matches(FECHA, { message: 'hasta debe tener formato YYYY-MM-DD' })
  hasta?: string;

  @IsOptional()
  @IsIn(['DEBITO', 'CREDITO'])
  tipo?: 'DEBITO' | 'CREDITO';

  @IsOptional()
  @IsString()
  @MaxLength(60)
  q?: string;
}

export class PeriodoDto {
  @IsOptional()
  @Matches(FECHA)
  desde?: string;

  @IsOptional()
  @Matches(FECHA)
  hasta?: string;
}

/** Plazos disponibles y su tasa anual de referencia (%). */
export const PLAZOS_FIJO: Record<number, number> = { 3: 3.5, 6: 4.5, 12: 5.5, 24: 6.5 };

export class PlazoFijoDto {
  @IsUUID()
  cuentaOrigenId: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1000)
  @Max(5_000_000)
  monto: number;

  @Type(() => Number)
  @IsInt()
  @IsIn(Object.keys(PLAZOS_FIJO).map(Number))
  plazoMeses: number;
}

export class LiquidarPlazoDto {
  @IsUUID()
  cuentaDestinoId: string;
}
