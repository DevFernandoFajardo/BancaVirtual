import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Cliente } from '../clientes/clientes.schema';
import { CpClient } from './cp.client';

export interface GestionParaCp {
  gestionRef: string;
  evaluacionRef: string;
  aceptadaEn: Date;
}

/**
 * Envía a CP Gestiones las gestiones (productos) que el cliente acepta.
 * Es "mejor esfuerzo": si CP Gestiones no responde, la solicitud local sigue su curso y el error queda guardado.
 */
@Injectable()
export class CpGestionesService {
  private readonly logger = new Logger(CpGestionesService.name);

  constructor(private readonly cp: CpClient) {}

  /** Contraseña aleatoria que cumple las reglas de CP (12-72, mayúscula, minúscula y número). El login sigue siendo local. */
  private claveTecnica(): string {
    return 'Bv' + randomBytes(18).toString('base64url').replace(/[^A-Za-z0-9]/g, 'x') + '7a';
  }

  /** Crea al cliente en CP Gestiones si aún no existe (409/422 por duplicado se tratan como "ya existe"). */
  private async asegurarCliente(c: Cliente): Promise<void> {
    const fecha = c.fechaNacimiento ? String(c.fechaNacimiento).slice(0, 10) : undefined;
    try {
      await this.cp.post(
        '/banca/registro',
        {
          cliente_ref: c.id,
          nombre: c.primerNombre,
          apellido: c.primerApellido,
          correo_electronico: c.email,
          contrasena: this.claveTecnica(),
          dpi: c.dpi,
          nit: c.nit,
          fecha_nacimiento: fecha,
          tipo_empleo: c.tipoEmpleo === 'Independiente' ? 'Independiente' : 'Asalariado',
          ingresos_mensuales_q: Number(c.ingresosMensuales),
          antiguedad_laboral_meses: c.antiguedadLaboralMeses ?? 0,
        },
        { idempotencyKey: `reg-${c.id}` },
      );
    } catch (err: any) {
      const status = err?.getStatus?.();
      // 409 / 422: el cliente (o su correo/DPI) ya está en CP; se intenta la gestión de todos modos
      if (status !== 409 && status !== 422) throw err;
      this.logger.warn(`Registro en CP omitido (${status}): ${err?.message}`);
    }
  }

  /** Fecha ISO 8601 en hora de Guatemala (UTC-6, sin horario de verano), sin milisegundos: 2026-10-07T11:30:00-06:00 */
  private static iso(d: Date): string {
    const g = new Date(d.getTime() - 6 * 3600 * 1000);
    return g.toISOString().replace(/\.\d{3}Z$/, '-06:00');
  }

  /** Devuelve el id de la gestión creada en CP Gestiones (si lo informa). */
  async registrarGestion(cliente: Cliente, g: GestionParaCp): Promise<string | null> {
    await this.asegurarCliente(cliente);
    const r = await this.cp.post<any>(
      '/banca/gestiones',
      {
        cliente_ref: cliente.id,
        gestion_ref: g.gestionRef,
        evaluacion_ref: g.evaluacionRef,
        referencia_aceptacion: `consent-${g.gestionRef}`,
        aceptada_en: CpGestionesService.iso(g.aceptadaEn),
      },
      { idempotencyKey: `gest-${g.gestionRef}` },
    );
    const id = r?.id ?? r?.gestion?.id ?? r?.solicitud?.id;
    return id !== undefined && id !== null ? String(id) : null;
  }
}
