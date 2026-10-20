import { Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Cliente } from '../clientes/clientes.schema';
import { CpClient } from './cp.client';

export interface GestionParaCp {
  /** Número de gestión de BancaVirtual (id local de la solicitud) */
  gestionRef: string;
  /** Código del producto en BancaVirtual/CreditPulse, p. ej. TARJETA_CREDITO */
  productoCodigo: string;
  /** Monto que pidió el cliente; si falta (solicitudes antiguas) se usa uno de referencia */
  monto?: number;
}

/** Códigos de producto de BancaVirtual -> códigos de CP Gestiones. "GENERAL" (precalificación) no es un producto. */
const PRODUCTO_CP: Record<string, string> = {
  TARJETA_CREDITO: 'credito-clasica',
  CREDITO_PERSONAL: 'credito-personal',
  CREDITO_VEHICULAR: 'credito-vehicular',
  PRESTAMO_HIPOTECARIO: 'credito-hipotecario',
};

/** BancaVirtual no pide el monto en el formulario, pero CP Gestiones sí: se envía un monto de referencia por producto. */
const MONTO_REFERENCIA: Record<string, number> = {
  'credito-clasica': 10_000,
  'credito-personal': 30_000,
  'credito-vehicular': 120_000,
  'credito-hipotecario': 600_000,
};

/**
 * Envía a CP Gestiones las gestiones (productos) que el cliente acepta (contrato v2: el cliente se identifica por DPI).
 * Es "mejor esfuerzo": si CP Gestiones no responde, la solicitud local sigue su curso y el error queda guardado.
 */
@Injectable()
export class CpGestionesService {
  private readonly logger = new Logger(CpGestionesService.name);

  constructor(private readonly cp: CpClient) {}

  /** Contraseña aleatoria que cumple la regla de CP (8-72, letras y números). El inicio de sesión de BancaVirtual es local. */
  private claveTecnica(): string {
    return 'Bv' + randomBytes(18).toString('base64url').replace(/[^A-Za-z0-9]/g, 'x') + '7a';
  }

  private static codigoDe(err: any): string | undefined {
    try {
      return err?.getResponse?.()?.code;
    } catch {
      return undefined;
    }
  }

  /** Crea el perfil en CP Gestiones si aún no existe. Si el DPI ya existe en el banco, CP lo vincula (mismo DPI, correo y fecha). */
  private async asegurarCliente(c: Cliente): Promise<void> {
    try {
      await this.cp.post(
        '/banca/registro',
        {
          nombre: c.primerNombre,
          apellido: c.primerApellido,
          correo_electronico: c.email,
          contrasena: this.claveTecnica(),
          dpi: c.dpi,
          fecha_nacimiento: String(c.fechaNacimiento).slice(0, 10),
        },
        {},
      );
    } catch (err: any) {
      // CUSTOMER_EXISTS: ya tiene perfil en CP, se sigue. CUSTOMER_LINK_REJECTED y demás errores sí se informan.
      if (CpGestionesService.codigoDe(err) !== 'CUSTOMER_EXISTS') throw err;
    }
  }

  /** Devuelve el id de la gestión creada en CP Gestiones (si lo informa). */
  async registrarGestion(cliente: Cliente, g: GestionParaCp): Promise<string | null> {
    const producto = PRODUCTO_CP[g.productoCodigo];
    if (!producto) throw new UnprocessableEntityException('Este producto no se gestiona en CP Gestiones');
    if (!cliente.dpi || !cliente.fechaNacimiento) throw new UnprocessableEntityException('El cliente no tiene DPI o fecha de nacimiento');

    await this.asegurarCliente(cliente);

    const base: Record<string, unknown> = {
      dpi: cliente.dpi,
      producto,
      monto_solicitado: (g.monto ?? MONTO_REFERENCIA[producto]).toFixed(2),
      nit: String(cliente.nit ?? '').replace(/[^0-9Kk]/g, '') || undefined,
      tipo_empleo: cliente.tipoEmpleo === 'Independiente' ? 'Independiente' : 'Asalariado',
      ingresos_mensuales_q: Number(cliente.ingresosMensuales),
      antiguedad_laboral_meses: cliente.antiguedadLaboralMeses ?? 0,
    };
    let r: any;
    try {
      r = await this.cp.post('/banca/solicitudes', { ...base, gestion_ref: g.gestionRef }, {});
    } catch (err: any) {
      // Si CP no acepta nuestro número de gestión (formato), se reintenta sin él: CP asigna su propio folio
      const campos = err?.getResponse?.()?.errors;
      if (err?.getStatus?.() === 422 && campos && 'gestion_ref' in campos) {
        r = await this.cp.post('/banca/solicitudes', base, {});
      } else {
        throw err;
      }
    }
    const id = r?.id ?? r?.solicitud?.id ?? r?.gestion?.id;
    return id !== undefined && id !== null ? String(id) : null;
  }
}
