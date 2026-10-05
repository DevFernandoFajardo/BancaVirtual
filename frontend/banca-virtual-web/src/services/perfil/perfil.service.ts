import { api } from '@/lib/api';
import { updateStoredUser } from '@/lib/session';
import type { Cliente, UpdatePerfilRequest } from '@/interfaces/auth.interface';

export const perfilService = {
  obtener: () => api<Cliente>('/clientes/me'),

  async actualizar(data: UpdatePerfilRequest): Promise<Cliente> {
    const cliente = await api<Cliente>('/clientes/me', { method: 'PATCH', body: data });
    updateStoredUser(cliente);
    return cliente;
  },
};
