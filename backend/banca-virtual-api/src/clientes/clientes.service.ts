import { BadRequestException, ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { blindIndex, encrypt, maskDocument } from '../common/crypto.util';
import { DatabaseService, PG_UNIQUE_VIOLATION, Queryable } from '../database/database.service';
import { CLIENTE_COLS, Cliente, ClienteRow, UpdatePerfilDto, mapCliente } from './clientes.schema';

export interface NuevoCliente {
  email: string;
  passwordHash: string;
  primerNombre: string;
  primerApellido: string;
  dpi: string;
  dpiHash: string;
  nit?: string;
  fechaNacimiento: string;
  ingresosMensuales?: number;
  tipoEmpleo?: string;
  antiguedadLaboralMeses?: number;
}

@Injectable()
export class ClientesService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * CP Gestiones eliminó al cliente: se borra aquí su ficha y TODO lo que depende de ella (cuentas, movimientos,
   * transferencias, tarjetas, préstamos, pagos, solicitudes, sesiones, notificaciones…), para que pueda
   * registrarse de nuevo con el mismo DPI y correo. Se busca por DPI o correo; nunca borra administradores.
   * Idempotente: si no existe responde eliminado: false.
   */
  async eliminarDesdeCp(dpi?: string, correo?: string): Promise<{ ok: true; eliminado: boolean }> {
    if (!dpi && !correo) throw new BadRequestException('Indica dpi o correo');
    return this.db.transaction(async (tx) => {
      const fichas = await this.db.rows<{ id: string }>(
        `SELECT id FROM clientes WHERE rol = 'CLIENTE' AND (($1::text IS NOT NULL AND dpi_hash = $1) OR ($2::text IS NOT NULL AND email = $2))`,
        [dpi ? blindIndex(dpi) : null, correo ? correo.toLowerCase() : null],
        tx,
      );
      for (const { id } of fichas) {
        const cuentas = `(SELECT id FROM cuentas WHERE cliente_id = $1)`;
        await tx.query(`DELETE FROM abonos_externos WHERE cuenta_id IN ${cuentas}`, [id]);
        await tx.query(`DELETE FROM transferencias WHERE cuenta_origen_id IN ${cuentas} OR cuenta_destino_id IN ${cuentas}`, [id]);
        await tx.query(`DELETE FROM transferencias_programadas WHERE cliente_id = $1 OR cuenta_origen_id IN ${cuentas}`, [id]);
        await tx.query(`DELETE FROM pagos_servicios WHERE cliente_id = $1 OR cuenta_id IN ${cuentas}`, [id]);
        await tx.query(`DELETE FROM prestamos WHERE cliente_id = $1 OR cuenta_desembolso_id IN ${cuentas}`, [id]);
        await tx.query('DELETE FROM tarjetas WHERE cliente_id = $1', [id]);
        // El resto (cuentas y movimientos, solicitudes, sesiones, notificaciones, beneficiarios…) cae por ON DELETE CASCADE
        await tx.query("DELETE FROM clientes WHERE id = $1 AND rol = 'CLIENTE'", [id]);
      }
      return { ok: true as const, eliminado: fichas.length > 0 };
    });
  }

  /** Celular registrado y cuenta que recibe las transferencias por celular. */
  async obtenerCelular(id: string): Promise<{ telefono: string | null; cuentaId: string | null }> {
    const r = await this.db
      .one<{ telefono: string | null; cuentaId: string | null }>(`SELECT telefono, cuenta_celular_id AS "cuentaId" FROM clientes WHERE id = $1`, [id])
      .catch(() => null); // si aún no se corrió 10_celular.sql
    return r ?? { telefono: null, cuentaId: null };
  }

  async guardarCelular(id: string, telefono: string | null, cuentaId?: string) {
    if (telefono === null) {
      await this.db.query('UPDATE clientes SET telefono = NULL, cuenta_celular_id = NULL, updated_at = now() WHERE id = $1', [id]);
      return { telefono: null, cuentaId: null };
    }
    if (cuentaId) {
      const cuenta = await this.db.one<{ estado: string; tipo: string }>('SELECT estado, tipo FROM cuentas WHERE id = $1 AND cliente_id = $2', [cuentaId, id]);
      if (!cuenta) throw new NotFoundException('Cuenta no encontrada');
      if (cuenta.estado !== 'ACTIVA' || cuenta.tipo === 'PLAZO_FIJO') {
        throw new UnprocessableEntityException('Elige una cuenta de ahorro o monetaria activa para recibir');
      }
    }
    try {
      await this.db.query('UPDATE clientes SET telefono = $2, cuenta_celular_id = $3, updated_at = now() WHERE id = $1', [id, telefono, cuentaId ?? null]);
    } catch (err: any) {
      if (err?.code === PG_UNIQUE_VIOLATION) throw new ConflictException('Ese número de celular ya está registrado por otro cliente');
      throw err;
    }
    return { telefono, cuentaId: cuentaId ?? null };
  }

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
        d.nit ? encrypt(d.nit) : null,
        d.fechaNacimiento,
        (d.ingresosMensuales ?? 0).toFixed(2),
        d.tipoEmpleo ?? null,
        d.antiguedadLaboralMeses ?? 0,
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
