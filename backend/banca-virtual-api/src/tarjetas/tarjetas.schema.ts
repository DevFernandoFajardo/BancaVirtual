import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export interface Tarjeta {
  id: string;
  productoNombre: string;
  ultimos4: string;
  titular: string;
  vencimiento: string;
  limite: number;
  saldoUtilizado: number;
  disponible: number;
  estado: 'ACTIVA' | 'BLOQUEADA';
  createdAt: Date;
}

export const TARJETA_COLS = `id, producto_nombre AS "productoNombre", ultimos4, titular, vencimiento,
  limite::float8 AS limite, saldo_utilizado::float8 AS "saldoUtilizado",
  (limite - saldo_utilizado)::float8 AS disponible, estado, created_at AS "createdAt"`;

export class PagarTarjetaDto {
  @IsUUID()
  cuentaId: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(1_000_000)
  monto: number;
}

export class ConsumoDemoDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(100_000)
  monto: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  comercio?: string;
}
