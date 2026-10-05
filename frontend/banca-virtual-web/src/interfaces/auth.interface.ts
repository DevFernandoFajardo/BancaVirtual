export interface Cliente {
  id: string;
  email: string;
  rol: 'CLIENTE' | 'ADMIN';
  primerNombre: string;
  primerApellido: string;
  /** Siempre enmascarado por la API (*********0101) */
  dpi: string | null;
  nit: string | null;
  fechaNacimiento: string | null;
  ingresosMensuales: number;
  tipoEmpleo: string | null;
  antiguedadLaboralMeses: number;
  createdAt: string;
}

export interface AuthResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  cliente: Cliente;
}

/** Si el cliente tiene verificación en dos pasos, el login devuelve esto en lugar del token */
export interface DesafioDosFactores {
  requiere2fa: true;
  desafio: string;
}

export type LoginResponse = AuthResponse | DesafioDosFactores;

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  primerNombre: string;
  primerApellido: string;
  dpi: string;
  nit: string;
  fechaNacimiento: string;
  ingresosMensuales: number;
  tipoEmpleo: string;
  antiguedadLaboralMeses?: number;
}

export interface UpdatePerfilRequest {
  ingresosMensuales?: number;
  tipoEmpleo?: string;
  antiguedadLaboralMeses?: number;
}
