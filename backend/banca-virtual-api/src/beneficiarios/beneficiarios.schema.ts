import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export interface Beneficiario {
  id: string;
  alias: string;
  cuentaNumero: string;
  titular: string;
  /** Celular con el que se guardó (la cuenta se resuelve al listar) */
  telefono: string | null;
  createdAt: Date;
}

/** Si se guardó por celular, la cuenta es la que ese número tiene asociada hoy; si no, la guardada. */
export const BENEFICIARIO_COLS = `id, alias,
  COALESCE((SELECT c.numero FROM clientes cl JOIN cuentas c ON c.cliente_id = cl.id AND c.estado = 'ACTIVA' AND c.tipo <> 'PLAZO_FIJO'
             WHERE beneficiarios.telefono IS NOT NULL AND cl.telefono = beneficiarios.telefono
             ORDER BY (c.id = cl.cuenta_celular_id) DESC, c.created_at LIMIT 1), cuenta_numero) AS "cuentaNumero",
  titular, telefono, created_at AS "createdAt"`;

export class CrearBeneficiarioDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  alias: string;

  @IsOptional()
  @Matches(/^\d{10}$/, { message: 'El número de cuenta debe tener 10 dígitos' })
  cuentaNumero?: string;

  /** Alternativa al número de cuenta: el celular (8 dígitos) del destinatario */
  @IsOptional()
  @Matches(/^[2-7]\d{7}$/, { message: 'El celular debe tener 8 dígitos' })
  telefono?: string;
}
