import { IsString, Matches, MaxLength } from 'class-validator';
import { PASSWORD_REGEX } from '../auth/auth.schema';

export class CambiarPasswordDto {
  @IsString()
  @MaxLength(72)
  passwordActual: string;

  @IsString()
  @Matches(PASSWORD_REGEX, { message: 'La contraseña nueva debe tener al menos 8 caracteres, con letras y números' })
  passwordNueva: string;
}

export class CodigoDto {
  @Matches(/^\d{6}$/, { message: 'El código debe tener 6 dígitos' })
  codigo: string;
}

export class DesactivarDosFactoresDto extends CodigoDto {
  @IsString()
  @MaxLength(72)
  password: string;
}
