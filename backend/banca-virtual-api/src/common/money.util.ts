/** Aritmética de dinero en centavos enteros para evitar errores de punto flotante. */
export const toCents = (amount: number | string): number => Math.round(Number(amount) * 100);
export const fromCents = (cents: number): string => (cents / 100).toFixed(2);
