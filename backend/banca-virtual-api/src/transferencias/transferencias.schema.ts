import { IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';

export class CrearTransferenciaDto {
  @IsUUID()
  cuentaOrigenId: string;

  @IsString()
  @Matches(/^\d{10}$/, { message: 'El número de cuenta destino debe tener 10 dígitos' })
  cuentaDestinoNumero: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(1_000_000)
  monto: number;

  @IsOptional()
  @IsString()
  @MaxLength(140)
  descripcion?: string;
}
