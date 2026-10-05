import { Type } from 'class-transformer';
import { IsNumber, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

export class PagarServicioDto {
  @IsString()
  @MaxLength(30)
  servicioCodigo: string;

  @IsString()
  @MinLength(4)
  @MaxLength(40)
  @Matches(/^[A-Za-z0-9\-_.]+$/, { message: 'El contrato solo puede llevar letras, números y guiones' })
  contrato: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(50_000)
  monto: number;

  @IsUUID()
  cuentaId: string;
}
