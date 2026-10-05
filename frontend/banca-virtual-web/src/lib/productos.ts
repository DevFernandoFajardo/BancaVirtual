import type { ProductoCatalogo } from '@/interfaces/solicitud.interface';

/**
 * Productos que el cliente puede solicitar. Son EXACTAMENTE los productos configurados en CreditPulse
 * (pantalla "Productos y Políticas" del motor): el `codigo` debe coincidir con el del CORE porque se envía
 * como `productoCodigo` en POST /evaluaciones.
 * Si en CreditPulse se agrega o desactiva un producto, se refleja aquí añadiendo o quitando su fila.
 */
export const PRODUCTOS: ProductoCatalogo[] = [
  {
    codigo: 'TARJETA_CREDITO',
    categoria: 'Tarjetas',
    nombre: 'Tarjeta de Crédito Clásica',
    descripcion: 'Tu tarjeta de crédito para compras y pagos del día a día.',
  },
  {
    codigo: 'CREDITO_PERSONAL',
    categoria: 'Créditos',
    nombre: 'Crédito Personal',
    descripcion: 'Dinero para lo que necesites, con cuotas fijas.',
  },
  {
    codigo: 'CREDITO_VEHICULAR',
    categoria: 'Créditos',
    nombre: 'Crédito Vehicular',
    descripcion: 'Estrena tu vehículo con cuotas a tu medida.',
  },
  {
    codigo: 'PRESTAMO_HIPOTECARIO',
    categoria: 'Créditos',
    nombre: 'Préstamo Hipotecario',
    descripcion: 'Financia la compra de tu casa o apartamento.',
  },
  {
    codigo: 'GENERAL',
    categoria: 'Precalificación',
    nombre: 'Precalificación General',
    descripcion: 'Conoce si calificas a un producto del banco antes de solicitarlo.',
  },
];

export const ESTADO_SOLICITUD_LABEL: Record<string, string> = {
  EN_EVALUACION: 'Evaluando tu solicitud',
  PENDIENTE_DECISION_CLIENTE: 'Esperando tu decisión',
  RECHAZADA_POR_POLITICAS: 'No aprobada',
  RECHAZADA_POR_CLIENTE: 'Rechazada por ti',
  ACEPTADA: 'Aceptada · en trámite',
  EMITIDA: 'Producto emitido',
  CANCELADA: 'Cancelada',
};
