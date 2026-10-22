import { Injectable, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { fromCents, toCents } from '../common/money.util';
import { CUENTA_COLS, Cuenta } from '../cuentas/cuentas.schema';
import { DatabaseService } from '../database/database.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { ConsultarServicioDto, PagarServicioDto } from './servicios.schema';
import { ProveedorServiciosClient } from './proveedor-servicios.client';

@Injectable()
export class ServiciosService {
  private readonly logger = new Logger(ServiciosService.name);
  private catalogoSync = 0; // última sincronización exitosa con el proveedor (ms)

  constructor(
    private readonly db: DatabaseService,
    private readonly notificaciones: NotificacionesService,
    private readonly proveedor: ProveedorServiciosClient,
  ) {}

  /**
   * Catálogo de servicios. Con la API externa configurada se toma de ella (se guarda en servicios_pago para
   * mantener el historial y se refresca cada 5 min); si la API no responde se usa lo último guardado.
   */
  async catalogo() {
    if (this.proveedor.activo && Date.now() - this.catalogoSync > 5 * 60_000) {
      try {
        const lista = await this.proveedor.catalogo();
        if (lista.length) {
          for (const s of lista) {
            await this.db.query(
              `INSERT INTO servicios_pago (codigo, nombre, categoria, referencia_etiqueta) VALUES ($1, $2, $3, $4)
               ON CONFLICT (codigo) DO UPDATE SET nombre = EXCLUDED.nombre, categoria = EXCLUDED.categoria, referencia_etiqueta = EXCLUDED.referencia_etiqueta`,
              [s.codigo, s.nombre, s.categoria, s.referenciaEtiqueta],
            );
          }
          this.catalogoSync = Date.now();
          this.codigosProveedor = new Set(lista.map((s) => s.codigo));
        }
      } catch (err: any) {
        this.logger.warn(`No se pudo traer el catálogo del proveedor: ${err?.message}`);
      }
    }
    const filas = await this.db.rows<{ codigo: string; nombre: string; categoria: string; referenciaEtiqueta: string }>(
      `SELECT codigo, nombre, categoria, referencia_etiqueta AS "referenciaEtiqueta" FROM servicios_pago ORDER BY categoria, nombre`,
    );
    // Con proveedor activo solo se ofrecen los servicios que él publica
    return this.proveedor.activo && this.codigosProveedor ? filas.filter((f) => this.codigosProveedor!.has(f.codigo)) : filas;
  }

  private codigosProveedor: Set<string> | null = null;

  /** Estado de la integración (para mostrar en la pantalla: "Pagos en línea con proveedor" vs. modo simulado). */
  modo() {
    return { externo: this.proveedor.activo, proveedor: this.proveedor.activo ? this.proveedor.nombre : 'Simulado' };
  }

  /** Consulta al proveedor cuánto debe el contrato (si ofrece esa consulta). */
  async consultar(dto: ConsultarServicioDto) {
    if (!this.proveedor.activo) return { disponible: false };
    const c = await this.proveedor.consultar(dto.servicioCodigo, dto.contrato.trim());
    return c ? { disponible: true, ...c } : { disponible: false };
  }

  async pagar(clienteId: string, dto: PagarServicioDto) {
    await this.catalogo(); // asegura que el servicio externo esté registrado localmente
    const servicio = await this.db.one<{ codigo: string; nombre: string }>(
      'SELECT codigo, nombre FROM servicios_pago WHERE codigo = $1',
      [dto.servicioCodigo],
    );
    if (!servicio || (this.proveedor.activo && this.codigosProveedor && !this.codigosProveedor.has(servicio.codigo))) {
      throw new NotFoundException('Servicio no encontrado');
    }

    const externo = this.proveedor.activo;
    const montoCents = toCents(dto.monto);
    const referencia = 'PAG-' + randomBytes(6).toString('hex').toUpperCase();
    const contrato = dto.contrato.trim();

    // Paso 1: se debita la cuenta y se registra el pago (PENDIENTE si falta la confirmación del proveedor)
    const r = await this.db.transaction(async (tx) => {
      const cuenta = await this.db.one<Cuenta>(`SELECT ${CUENTA_COLS} FROM cuentas WHERE id = $1 FOR UPDATE`, [dto.cuentaId], tx);
      if (!cuenta || cuenta.clienteId !== clienteId) throw new NotFoundException('Cuenta no encontrada');
      if (cuenta.estado !== 'ACTIVA' || cuenta.tipo === 'PLAZO_FIJO') {
        throw new UnprocessableEntityException('Elige una cuenta monetaria o de ahorro activa');
      }
      const saldo = toCents(cuenta.saldo);
      if (saldo < montoCents) throw new UnprocessableEntityException('Fondos insuficientes');
      const nuevo = fromCents(saldo - montoCents);
      await tx.query('UPDATE cuentas SET saldo = $1 WHERE id = $2', [nuevo, cuenta.id]);
      await tx.query(
        `INSERT INTO movimientos (cuenta_id, tipo, monto, saldo_posterior, descripcion, referencia)
         VALUES ($1, 'DEBITO', $2, $3, $4, $5)`,
        [cuenta.id, fromCents(montoCents), nuevo, `Pago de servicio: ${servicio.nombre} (${contrato})`, referencia],
      );
      const pago = externo
        ? await this.db.one<{ createdAt: Date }>(
            `INSERT INTO pagos_servicios (cliente_id, cuenta_id, servicio_codigo, servicio_nombre, contrato, monto, referencia, estado, proveedor)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDIENTE', $8) RETURNING created_at AS "createdAt"`,
            [clienteId, cuenta.id, servicio.codigo, servicio.nombre, contrato, fromCents(montoCents), referencia, this.proveedor.nombre],
            tx,
          )
        : await this.db.one<{ createdAt: Date }>(
            `INSERT INTO pagos_servicios (cliente_id, cuenta_id, servicio_codigo, servicio_nombre, contrato, monto, referencia)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING created_at AS "createdAt"`,
            [clienteId, cuenta.id, servicio.codigo, servicio.nombre, contrato, fromCents(montoCents), referencia],
            tx,
          );
      return { cuentaId: cuenta.id, cuentaNumero: cuenta.numero, saldoDespues: nuevo, fecha: pago!.createdAt };
    });

    // Paso 2: el proveedor externo ejecuta el pago. Si falla, se devuelve el dinero (reverso) y se informa al cliente.
    let autorizacion: string | null = null;
    if (externo) {
      try {
        autorizacion = (await this.proveedor.pagar({ servicio: servicio.codigo, contrato, monto: dto.monto, referencia })).autorizacion;
        await this.db.query(`UPDATE pagos_servicios SET estado = 'APROBADO', autorizacion = $2 WHERE referencia = $1`, [referencia, autorizacion]);
      } catch (err: any) {
        await this.revertir(r.cuentaId, montoCents, servicio.nombre, referencia);
        if (err?.incierto) await this.proveedor.reversar(referencia); // el proveedor pudo haberlo procesado: se le pide anular
        this.logger.warn(`Pago ${referencia} revertido: ${err?.message}`);
        throw err;
      }
    }

    await this.notificaciones.crear(
      clienteId,
      'PAGO',
      'Pago de servicio realizado',
      `Pagaste Q${dto.monto.toFixed(2)} a ${servicio.nombre}. Ref. ${referencia}.`,
      '/servicios',
    );
    return {
      referencia,
      servicio: servicio.nombre,
      contrato,
      monto: Number(fromCents(montoCents)),
      cuentaOrigen: r.cuentaNumero,
      saldoDespues: Number(r.saldoDespues),
      fecha: r.fecha,
      autorizacion,
      proveedor: externo ? this.proveedor.nombre : null,
    };
  }

  /** Devuelve a la cuenta lo debitado cuando el proveedor no pudo ejecutar el pago. */
  private async revertir(cuentaId: string, montoCents: number, nombre: string, referencia: string) {
    await this.db.transaction(async (tx) => {
      const c = await this.db.one<{ saldo: string }>('SELECT saldo::text AS saldo FROM cuentas WHERE id = $1 FOR UPDATE', [cuentaId], tx);
      if (!c) return;
      const nuevo = fromCents(toCents(c.saldo) + montoCents);
      await tx.query('UPDATE cuentas SET saldo = $1 WHERE id = $2', [nuevo, cuentaId]);
      await tx.query(
        `INSERT INTO movimientos (cuenta_id, tipo, monto, saldo_posterior, descripcion, referencia) VALUES ($1, 'CREDITO', $2, $3, $4, $5)`,
        [cuentaId, fromCents(montoCents), nuevo, `Reverso de pago de servicio: ${nombre}`.slice(0, 140), 'REV-' + referencia.slice(4)],
      );
      await tx.query(`UPDATE pagos_servicios SET estado = 'REVERSADO' WHERE referencia = $1`, [referencia]);
    });
  }

  async historial(clienteId: string, page = 1, limit = 20) {
    // Solo pagos aprobados (los revertidos no se muestran). Si la columna `estado` aún no existe, se listan todos.
    for (const filtro of [`AND p.estado = 'APROBADO'`, '']) {
      try {
        const items = await this.db.rows(
          `SELECT p.id, p.referencia, p.servicio_codigo AS "servicioCodigo", p.servicio_nombre AS servicio, p.contrato,
                  p.monto::float8 AS monto, c.numero AS "cuentaOrigen", p.created_at AS fecha
             FROM pagos_servicios p JOIN cuentas c ON c.id = p.cuenta_id
            WHERE p.cliente_id = $1 ${filtro} ORDER BY p.created_at DESC, p.id DESC LIMIT $2 OFFSET $3`,
          [clienteId, limit, (page - 1) * limit],
        );
        const total = (await this.db.one<{ n: number }>(`SELECT count(*)::int AS n FROM pagos_servicios p WHERE p.cliente_id = $1 ${filtro}`, [clienteId]))!.n;
        return { items, total, page, limit };
      } catch (err) {
        if (!filtro) throw err;
      }
    }
  }
}
