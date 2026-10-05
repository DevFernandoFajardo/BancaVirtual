import { api } from '@/lib/api';
import type {
  AbrirCuentaRequest,
  Cuenta,
  CuentaDestino,
  Movimiento,
  Paginado,
} from '@/interfaces/cuenta.interface';

export const cuentasService = {
  listar: () => api<Cuenta[]>('/cuentas'),

  obtener: (id: string) => api<Cuenta>(`/cuentas/${id}`),

  abrir: (data: AbrirCuentaRequest) => api<Cuenta>('/cuentas', { method: 'POST', body: data }),

  movimientos: (id: string, page = 1, limit = 20) =>
    api<Paginado<Movimiento>>(`/cuentas/${id}/movimientos?page=${page}&limit=${limit}`),

  /** Busca a quién pertenece un número de cuenta antes de transferir */
  validarDestino: (numero: string) => api<CuentaDestino>(`/cuentas/validar/${encodeURIComponent(numero)}`),

  /** Solo demostración: simula un depósito en ventanilla */
  depositoDemo: (id: string, monto: number) =>
    api<Cuenta>(`/cuentas/${id}/deposito-demo`, { method: 'POST', body: { monto } }),
};
