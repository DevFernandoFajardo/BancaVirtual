import { Type } from 'class-transformer';
import { IsEmail, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';
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

/** Abono que envía un sistema externo (p. ej. CP Gestiones al pagar una planilla). */
export class AbonoExternoDto {
  /** Número de cuenta destino (ahorro o monetaria). Si se omite, se usa `dpi` */
  @IsOptional()
  @IsString()
  @Matches(/^\d{6,12}$/, { message: 'Número de cuenta inválido' })
  cuentaNumero?: string;

  /** Alternativa al número de cuenta: DPI del cliente (se abona a su cuenta `tipoCuenta`, por omisión ahorro) */
  @IsOptional()
  @Matches(/^\d{13}$/, { message: 'El DPI debe tener 13 dígitos' })
  dpi?: string;

  @IsOptional()
  @IsIn(['AHORRO', 'MONETARIA'])
  tipoCuenta?: 'AHORRO' | 'MONETARIA';

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(10_000_000)
  monto: number;

  /** Ej.: "Pago de planilla Octubre 2026 · Empresa X" */
  @IsString()
  @MaxLength(100)
  concepto: string;

  /** Id único del pago en el sistema externo (idempotencia: reenviarlo no vuelve a acreditar) */
  @IsString()
  @Matches(/^[A-Za-z0-9_.:\-]{6,64}$/, { message: 'referencia inválida (6-64 caracteres)' })
  referencia: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  origen?: string;
}

/** Cuenta que abre el banco en CP Gestiones; se enlaza al cliente por su DPI. */
export class CuentaDesdeCpDto {
  @Matches(/^\d{13}$/, { message: 'El DPI debe tener 13 dígitos' })
  dpi: string;

  /** Correo del cliente en CP (con el que inicia sesión): permite crear su ficha si aún no ha entrado a la banca */
  @IsEmail()
  @MaxLength(160)
  correo: string;

  @IsIn(['AHORRO', 'MONETARIA'])
  tipo: 'AHORRO' | 'MONETARIA';

  /** Número de cuenta que le asignó CP (6-12 dígitos). Si se omite, la banca genera uno */
  @IsOptional()
  @IsString()
  @Matches(/^\d{6,12}$/, { message: 'Número de cuenta inválido (6-12 dígitos)' })
  numero?: string;

  @IsOptional() @IsString() @MaxLength(40) alias?: string;
  @IsOptional() @IsString() @MaxLength(80) nombre?: string;
  @IsOptional() @IsString() @MaxLength(80) apellido?: string;
}
