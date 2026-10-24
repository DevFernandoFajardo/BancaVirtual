import { api } from '@/lib/api';
import type { Paginado } from '@/interfaces/cuenta.interface';
import type {
  ComprobanteTransferencia,
  CrearTransferenciaCelularRequest,
  CrearTransferenciaRequest,
  PendienteCelular,
  ResultadoTransferenciaCelular,
  TransferenciaHistorial,
} from '@/interfaces/transferencia.interface';

export const transferenciasService = {
  crear: (data: CrearTransferenciaRequest) =>
    api<ComprobanteTransferencia>('/transferencias', { method: 'POST', body: data }),

  /** Transferencia móvil: a un celular registrado, o pendiente de reclamar si todavía no existe */
  crearCelular: (data: CrearTransferenciaCelularRequest) =>
    api<ResultadoTransferenciaCelular>('/transferencias/celular', { method: 'POST', body: data }),

  pendientesCelular: () => api<PendienteCelular[]>('/transferencias/celular/pendientes'),

  cancelarPendiente: (id: string) => api<{ ok: true }>(`/transferencias/celular/pendientes/${id}/cancelar`, { method: 'POST' }),

  historial: (page = 1, limit = 20) =>
    api<Paginado<TransferenciaHistorial>>(`/transferencias?page=${page}&limit=${limit}`),
};
