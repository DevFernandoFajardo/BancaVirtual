import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CuentasService } from '../cuentas/cuentas.service';
import { DatabaseService, PG_UNIQUE_VIOLATION } from '../database/database.service';
import { BENEFICIARIO_COLS, Beneficiario, CrearBeneficiarioDto } from './beneficiarios.schema';

@Injectable()
export class BeneficiariosService {
  constructor(
    private readonly db: DatabaseService,
    private readonly cuentas: CuentasService,
  ) {}

  listar(clienteId: string) {
    return this.db.rows<Beneficiario>(
      `SELECT ${BENEFICIARIO_COLS} FROM beneficiarios WHERE cliente_id = $1 ORDER BY alias`,
      [clienteId],
    );
  }

  async crear(clienteId: string, dto: CrearBeneficiarioDto) {
    // Valida que la cuenta exista y guarda el titular enmascarado que vio el cliente
    const destino = await this.cuentas.validarNumero(dto.cuentaNumero);
    const propia = await this.db.one('SELECT 1 FROM cuentas WHERE numero = $1 AND cliente_id = $2', [dto.cuentaNumero, clienteId]);
    if (propia) throw new BadRequestException('Esa es una de tus cuentas: puedes transferir entre tus cuentas sin guardarla');
    try {
      return (await this.db.one<Beneficiario>(
        `INSERT INTO beneficiarios (cliente_id, alias, cuenta_numero, titular) VALUES ($1, $2, $3, $4) RETURNING ${BENEFICIARIO_COLS}`,
        [clienteId, dto.alias.trim(), dto.cuentaNumero, destino.titular],
      ))!;
    } catch (err: any) {
      if (err?.code === PG_UNIQUE_VIOLATION) throw new ConflictException('Ya guardaste esta cuenta como beneficiario');
      throw err;
    }
  }

  async eliminar(clienteId: string, id: string) {
    const r = await this.db.query('DELETE FROM beneficiarios WHERE id = $1 AND cliente_id = $2', [id, clienteId]);
    if (!r.rowCount) throw new NotFoundException('Beneficiario no encontrado');
    return { ok: true };
  }
}
