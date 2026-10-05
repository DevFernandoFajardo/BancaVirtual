const quetzales = new Intl.NumberFormat('es-GT', {
  style: 'currency',
  currency: 'GTQ',
  currencyDisplay: 'narrowSymbol',
});

/** Acepta número o texto decimal ("1000.50") y lo muestra como Q1,000.50 */
export function formatMoney(value: number | string, moneda = 'GTQ'): string {
  const n = typeof value === 'string' ? Number(value) : value;
  if (moneda !== 'GTQ') return `${moneda} ${n.toFixed(2)}`;
  return quetzales.format(n);
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('es-GT', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
}

export function formatDay(iso: string): string {
  return new Intl.DateTimeFormat('es-GT', { dateStyle: 'long' }).format(new Date(iso));
}

/** 2123456789 -> 2-123-456789 (solo presentación) */
export function formatCuenta(numero: string): string {
  return numero.length === 10 ? `${numero.slice(0, 1)}-${numero.slice(1, 4)}-${numero.slice(4)}` : numero;
}

export const TIPO_CUENTA_LABEL = {
  AHORRO: 'Cuenta de ahorro',
  MONETARIA: 'Cuenta monetaria',
  PLAZO_FIJO: 'Plazo fijo',
} as const;

/** 2026-10-05 -> 5 oct 2026 (sin desfases de zona horaria) */
export function formatFecha(ymd: string): string {
  return new Intl.DateTimeFormat('es-GT', { dateStyle: 'medium' }).format(new Date(`${ymd.slice(0, 10)}T12:00:00`));
}

/** Fecha de hoy en Guatemala como YYYY-MM-DD (para campos <input type=date>) */
export function hoyGT(offsetDias = 0): string {
  const d = new Date(Date.now() + offsetDias * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala' }).format(d);
}

/** Hace 5 min / ayer / 3 oct */
export function formatRelativo(iso: string): string {
  const seg = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seg < 60) return 'justo ahora';
  if (seg < 3600) return `hace ${Math.floor(seg / 60)} min`;
  if (seg < 86_400) return `hace ${Math.floor(seg / 3600)} h`;
  if (seg < 172_800) return 'ayer';
  return new Intl.DateTimeFormat('es-GT', { dateStyle: 'medium' }).format(new Date(iso));
}
