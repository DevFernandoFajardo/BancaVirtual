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

/** Transferencia móvil: al celular de otro cliente (si ese número aún no existe, queda pendiente de reclamar). */
export class CrearTransferenciaCelularDto {
  @IsUUID()
  cuentaOrigenId: string;

  @IsString()
  @Matches(/^[2-7]\d{7}$/, { message: 'El celular debe tener 8 dígitos' })
  telefono: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(1_000_000)
  monto: number;

  @IsOptional()
  @IsString()
  @MaxLength(140)
  descripcion?: string;
}
