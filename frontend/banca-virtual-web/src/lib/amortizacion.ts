interface Fila {
  n: number;
  cuota: number;
  interes: number;
  capital: number;
  saldo: number;
}

/** Sistema francés: cuota fija. */
export function amortizar(monto: number, tasaAnual: number, meses: number): { cuota: number; filas: Fila[] } {
  const i = tasaAnual / 100 / 12;
  const cuota = i === 0 ? monto / meses : (monto * i) / (1 - Math.pow(1 + i, -meses));
  const filas: Fila[] = [];
  let saldo = monto;
  for (let n = 1; n <= meses; n++) {
    const interes = saldo * i;
    const capital = n === meses ? saldo : cuota - interes;
    saldo = Math.max(0, saldo - capital);
    filas.push({ n, cuota: capital + interes, interes, capital, saldo });
  }
  return { cuota, filas };
}
