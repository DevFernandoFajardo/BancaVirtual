import { api } from '@/lib/api';
import { clearSession, saveSession } from '@/lib/session';
import type { AuthResponse, LoginRequest, LoginResponse, RegisterRequest } from '@/interfaces/auth.interface';

export const authService = {
  /** Devuelve la sesión iniciada, o un desafío si se requiere el código de verificación en dos pasos. */
  async login(data: LoginRequest): Promise<LoginResponse> {
    const res = await api<LoginResponse>('/auth/login', { method: 'POST', body: data, auth: false });
    if ('accessToken' in res) saveSession(res.accessToken, res.cliente);
    return res;
  },

  async verificarDosFactores(desafio: string, codigo: string): Promise<AuthResponse> {
    const res = await api<AuthResponse>('/auth/2fa/verificar', { method: 'POST', body: { desafio, codigo }, auth: false });
    saveSession(res.accessToken, res.cliente);
    return res;
  },

  async register(data: RegisterRequest): Promise<AuthResponse> {
    const res = await api<AuthResponse>('/auth/register', { method: 'POST', body: data, auth: false });
    saveSession(res.accessToken, res.cliente);
    return res;
  },

  /** Cierra la sesión también en el servidor (si falla, igual se limpia el navegador). */
  async logout() {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch {
      /* sin conexión o token vencido: da igual */
    }
    clearSession();
  },
};
