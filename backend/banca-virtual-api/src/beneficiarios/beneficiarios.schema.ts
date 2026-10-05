import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export interface Beneficiario {
  id: string;
  alias: string;
  cuentaNumero: string;
  titular: string;
  createdAt: Date;
}

export const BENEFICIARIO_COLS = `id, alias, cuenta_numero AS "cuentaNumero", titular, created_at AS "createdAt"`;

export class CrearBeneficiarioDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  alias: string;

  @Matches(/^\d{10}$/, { message: 'El número de cuenta debe tener 10 dígitos' })
  cuentaNumero: string;
}
