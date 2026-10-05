import { clearSession, getToken } from './session';

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** false en login/registro: no envía token ni redirige ante un 401 */
  auth?: boolean;
}

/** Convierte los distintos formatos de error de NestJS en un texto legible. */
function extractMessage(data: unknown, status: number): string {
  if (data && typeof data === 'object') {
    const d = data as { message?: unknown; detail?: unknown };
    if (Array.isArray(d.message)) return d.message.join('. ');
    if (typeof d.message === 'string') return typeof d.detail === 'string' ? `${d.message}: ${d.detail}` : d.message;
  }
  if (status === 429) return 'Demasiados intentos. Espera un momento e inténtalo de nuevo.';
  if (status >= 500) return 'Ocurrió un problema en el servidor. Inténtalo de nuevo.';
  return 'No se pudo completar la operación.';
}

export async function api<T>(path: string, { method = 'GET', body, auth = true }: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'No se pudo conectar con el servidor. Revisa tu conexión.');
  }

  const data: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    if (res.status === 401 && auth) {
      // Sesión vencida o token inválido
      clearSession();
      if (typeof window !== 'undefined') window.location.href = '/login?expirada=1';
    }
    throw new ApiError(res.status, extractMessage(data, res.status), data);
  }
  return data as T;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Ocurrió un error inesperado.';
}
