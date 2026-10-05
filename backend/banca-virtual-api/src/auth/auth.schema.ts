import {
  IsDateString,
  IsEmail,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export type Rol = 'CLIENTE' | 'ADMIN';

export interface AuthUser {
  /** id del cliente, o 'service' cuando se autentica con X-Service-Key */
  sub: string;
  rol: Rol;
  /** id de la sesión (tabla sesiones); no existe en llamadas con X-Service-Key */
  sid?: string;
}

export class RegisterDto {
  @IsEmail()
  @MaxLength(160)
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  primerNombre: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  primerApellido: string;

  @Matches(/^\d{13}$/, { message: 'El DPI debe tener 13 dígitos' })
  dpi: string;

  @IsString()
  @Matches(/^[0-9]{1,12}(-?[0-9Kk])?$/, { message: 'NIT inválido' })
  nit: string;

  @IsDateString()
  fechaNacimiento: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100_000_000)
  ingresosMensuales: number;

  @IsString()
  @MaxLength(40)
  tipoEmpleo: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1200)
  antiguedadLaboralMeses?: number;
}

/** Contraseña nueva: mínimo 8 caracteres con al menos una letra y un número. */
export const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).{8,72}$/;

export class VerificarDosFactoresDto {
  @IsString()
  @MaxLength(2000)
  desafio: string;

  @Matches(/^\d{6}$/, { message: 'El código debe tener 6 dígitos' })
  codigo: string;
}

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MaxLength(72)
  password: string;
}
