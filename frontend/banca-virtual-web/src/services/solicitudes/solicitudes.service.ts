import { api } from '@/lib/api';
import type { CrearSolicitudRequest, Solicitud } from '@/interfaces/solicitud.interface';

export const solicitudesService = {
  /** Evalúa la solicitud en el CORE y devuelve el resultado. El cliente decide después. */
  crear: (data: CrearSolicitudRequest) => api<Solicitud>('/solicitudes', { method: 'POST', body: data }),

  listar: () => api<Solicitud[]>('/solicitudes'),

  obtener: (id: string) => api<Solicitud>(`/solicitudes/${id}`),

  decidir: (id: string, aceptar: boolean) =>
    api<Solicitud>(`/solicitudes/${id}/decision`, { method: 'POST', body: { aceptar } }),
};
