import { IsInt, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { Rol } from '../auth/auth.schema';
import { decrypt } from '../common/crypto.util';

export interface Cliente {
  id: string;
  email: string;
  passwordHash: string;
  rol: Rol;
  primerNombre: string;
  primerApellido: string;
  dpi: string | null;
  nit: string | null;
  fechaNacimiento: string | null;
  ingresosMensuales: string;
  tipoEmpleo: string | null;
  antiguedadLaboralMeses: number;
  createdAt: Date;
}

/** Fila tal como sale de PostgreSQL (DPI y NIT todavía cifrados) */
export interface ClienteRow extends Omit<Cliente, 'dpi' | 'nit'> {
  dpiCifrado: string | null;
  nitCifrado: string | null;
}

/** Columnas de `clientes` con alias camelCase */
export const CLIENTE_COLS = `
  id, email, password_hash AS "passwordHash", rol,
  primer_nombre AS "primerNombre", primer_apellido AS "primerApellido",
  dpi_cifrado AS "dpiCifrado", nit_cifrado AS "nitCifrado",
  fecha_nacimiento AS "fechaNacimiento",
  ingresos_mensuales::text AS "ingresosMensuales",
  tipo_empleo AS "tipoEmpleo",
  antiguedad_laboral_meses AS "antiguedadLaboralMeses",
  created_at AS "createdAt"`;

export function mapCliente(r: ClienteRow): Cliente {
  const { dpiCifrado, nitCifrado, ...rest } = r;
  return {
    ...rest,
    dpi: dpiCifrado ? decrypt(dpiCifrado) : null,
    nit: nitCifrado ? decrypt(nitCifrado) : null,
  };
}

export class UpdatePerfilDto {
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100_000_000)
  ingresosMensuales?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  tipoEmpleo?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1200)
  antiguedadLaboralMeses?: number;
}

/** Celular (8 dígitos, Guatemala) y cuenta que recibe las transferencias hechas a ese número. telefono = null lo quita. */
export class CelularDto {
  @ValidateIf((o) => o.telefono !== null)
  @Matches(/^[2-7]\d{7}$/, { message: 'El celular debe tener 8 dígitos' })
  telefono: string | null;

  /** Opcional: si no se indica, recibe la cuenta activa más antigua */
  @IsOptional()
  @IsUUID()
  cuentaId?: string;
}
