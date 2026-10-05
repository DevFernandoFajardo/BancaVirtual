import { api } from '@/lib/api';
import type { Paginado } from '@/interfaces/cuenta.interface';
import type {
  ComprobanteTransferencia,
  CrearTransferenciaRequest,
  TransferenciaHistorial,
} from '@/interfaces/transferencia.interface';

export const transferenciasService = {
  crear: (data: CrearTransferenciaRequest) =>
    api<ComprobanteTransferencia>('/transferencias', { method: 'POST', body: data }),

  historial: (page = 1, limit = 20) =>
    api<Paginado<TransferenciaHistorial>>(`/transferencias?page=${page}&limit=${limit}`),
};
