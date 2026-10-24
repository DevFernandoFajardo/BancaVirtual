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
    if (!dto.cuentaNumero && !dto.telefono) throw new BadRequestException('Indica el número de cuenta o el celular del beneficiario');
    // Valida que la cuenta exista (directa o por celular) y guarda el titular enmascarado que vio el cliente
    const destino = dto.telefono ? await this.cuentas.validarCelular(dto.telefono) : await this.cuentas.validarNumero(dto.cuentaNumero!);
    if ('registrado' in destino && !destino.registrado) {
      throw new NotFoundException('Ese celular aún no está registrado. Puedes enviarle desde «Nueva transferencia → Celular»: lo recibirá cuando se registre.');
    }
    const propia = await this.db.one('SELECT 1 FROM cuentas WHERE numero = $1 AND cliente_id = $2', [destino.numero, clienteId]);
    if (propia) throw new BadRequestException('Esa es una de tus cuentas: puedes transferir entre tus cuentas sin guardarla');
    try {
      return (await this.db.one<Beneficiario>(
        `INSERT INTO beneficiarios (cliente_id, alias, cuenta_numero, titular, telefono) VALUES ($1, $2, $3, $4, $5) RETURNING ${BENEFICIARIO_COLS}`,
        [clienteId, dto.alias.trim(), destino.numero, destino.titular, dto.telefono ?? null],
      ))!;
    } catch (err: any) {
      if (err?.code === PG_UNIQUE_VIOLATION) throw new ConflictException('Ya guardaste este beneficiario');
      throw err;
    }
  }

  async eliminar(clienteId: string, id: string) {
    const r = await this.db.query('DELETE FROM beneficiarios WHERE id = $1 AND cliente_id = $2', [id, clienteId]);
    if (!r.rowCount) throw new NotFoundException('Beneficiario no encontrado');
    return { ok: true };
  }
}
