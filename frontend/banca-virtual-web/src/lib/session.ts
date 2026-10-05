import type { Cliente } from '@/interfaces/auth.interface';

const TOKEN_KEY = 'bv_token';
const USER_KEY = 'bv_user';

/**
 * El token vive en localStorage (simple para este proyecto). Es legible por JavaScript:
 * si algún día la app tuviera una vulnerabilidad XSS, un atacante podría leerlo.
 * Para producción real conviene una cookie httpOnly emitida por un backend-for-frontend.
 */
export function saveSession(token: string, cliente: Cliente) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(cliente));
  } catch {
    /* almacenamiento no disponible (modo privado): la sesión durará hasta recargar */
  }
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getStoredUser(): Cliente | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as Cliente) : null;
  } catch {
    return null;
  }
}

export function updateStoredUser(cliente: Cliente) {
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(cliente));
  } catch {
    /* ignorar */
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch {
    /* ignorar */
  }
}
