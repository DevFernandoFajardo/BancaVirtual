/** Debe coincidir con PLAZOS_FIJO del backend. */
export const PLAZOS_FIJO: { meses: number; tasa: number }[] = [
  { meses: 3, tasa: 3.5 },
  { meses: 6, tasa: 4.5 },
  { meses: 12, tasa: 5.5 },
  { meses: 24, tasa: 6.5 },
];

export const interesPlazo = (capital: number, tasaAnual: number, meses: number) => (capital * tasaAnual * meses) / 12 / 100;
