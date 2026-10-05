import { Injectable, NotFoundException } from '@nestjs/common';
import { encrypt, maskDocument } from '../common/crypto.util';
import { DatabaseService, Queryable } from '../database/database.service';
import { CLIENTE_COLS, Cliente, ClienteRow, UpdatePerfilDto, mapCliente } from './clientes.schema';

export interface NuevoCliente {
  email: string;
  passwordHash: string;
  primerNombre: string;
  primerApellido: string;
  dpi: string;
  dpiHash: string;
  nit: string;
  fechaNacimiento: string;
  ingresosMensuales: number;
  tipoEmpleo: string;
  antiguedadLaboralMeses: number;
}

@Injectable()
export class ClientesService {
  constructor(private readonly db: DatabaseService) {}

  async obtener(id: string): Promise<Cliente> {
    const row = await this.db.one<ClienteRow>(`SELECT ${CLIENTE_COLS} FROM clientes WHERE id = $1`, [id]);
    if (!row) throw new NotFoundException('Cliente no encontrado');
    return mapCliente(row);
  }

  async buscarPorEmail(email: string): Promise<Cliente | null> {
    const row = await this.db.one<ClienteRow>(`SELECT ${CLIENTE_COLS} FROM clientes WHERE email = $1`, [email]);
    return row ? mapCliente(row) : null;
  }

  async existeEmail(email: string): Promise<boolean> {
    return !!(await this.db.one('SELECT 1 FROM clientes WHERE email = $1', [email]));
  }

  async existeDpiHash(dpiHash: string): Promise<boolean> {
    return !!(await this.db.one('SELECT 1 FROM clientes WHERE dpi_hash = $1', [dpiHash]));
  }

  async crear(tx: Queryable, d: NuevoCliente): Promise<Cliente> {
    const row = await this.db.one<ClienteRow>(
      `INSERT INTO clientes
         (email, password_hash, rol, primer_nombre, primer_apellido, dpi_cifrado, dpi_hash, nit_cifrado,
          fecha_nacimiento, ingresos_mensuales, tipo_empleo, antiguedad_laboral_meses)
       VALUES ($1, $2, 'CLIENTE', $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING ${CLIENTE_COLS}`,
      [
        d.email,
        d.passwordHash,
        d.primerNombre,
        d.primerApellido,
        encrypt(d.dpi),
        d.dpiHash,
        encrypt(d.nit),
        d.fechaNacimiento,
        d.ingresosMensuales.toFixed(2),
        d.tipoEmpleo,
        d.antiguedadLaboralMeses,
      ],
      tx,
    );
    return mapCliente(row!);
  }

  async crearAdmin(email: string, passwordHash: string): Promise<void> {
    await this.db.query(
      `INSERT INTO clientes (email, password_hash, rol, primer_nombre, primer_apellido)
       VALUES ($1, $2, 'ADMIN', 'Administrador', 'Sistema')`,
      [email, passwordHash],
    );
  }

  async actualizarPerfil(id: string, dto: UpdatePerfilDto): Promise<Cliente> {
    const row = await this.db.one<ClienteRow>(
      `UPDATE clientes SET
         ingresos_mensuales       = COALESCE($2, ingresos_mensuales),
         tipo_empleo              = COALESCE($3, tipo_empleo),
         antiguedad_laboral_meses = COALESCE($4, antiguedad_laboral_meses),
         updated_at               = now()
       WHERE id = $1
       RETURNING ${CLIENTE_COLS}`,
      [id, dto.ingresosMensuales?.toFixed(2) ?? null, dto.tipoEmpleo ?? null, dto.antiguedadLaboralMeses ?? null],
    );
    if (!row) throw new NotFoundException('Cliente no encontrado');
    return mapCliente(row);
  }

  /** Para la app administrativa: solo clientes (no administradores). */
  async listarClientes(page = 1, limit = 20) {
    const rows = await this.db.rows<ClienteRow>(
      `SELECT ${CLIENTE_COLS} FROM clientes WHERE rol = 'CLIENTE' ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [limit, (page - 1) * limit],
    );
    const total = (await this.db.one<{ total: number }>(`SELECT count(*)::int AS total FROM clientes WHERE rol = 'CLIENTE'`))!
      .total;
    return { items: rows.map((r) => this.toPublic(mapCliente(r))), total, page, limit };
  }

  /** Vista pública: nunca expone passwordHash ni documentos completos. */
  toPublic(c: Cliente) {
    return {
      id: c.id,
      email: c.email,
      rol: c.rol,
      primerNombre: c.primerNombre,
      primerApellido: c.primerApellido,
      dpi: maskDocument(c.dpi),
      nit: c.nit,
      fechaNacimiento: c.fechaNacimiento,
      ingresosMensuales: Number(c.ingresosMensuales),
      tipoEmpleo: c.tipoEmpleo,
      antiguedadLaboralMeses: c.antiguedadLaboralMeses,
      createdAt: c.createdAt,
    };
  }
}
