'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Field, SelectField } from '@/components/ui/Field';
import { amortizar } from '@/lib/amortizacion';
import { formatMoney } from '@/lib/format';

/** Tasas de referencia (anuales) para el simulador. */
const TIPOS = [
  { codigo: 'CREDITO_PERSONAL', nombre: 'Crédito personal', tasa: 18, max: 300_000, plazoMax: 60, plazoDef: 36, montoDef: 30_000 },
  { codigo: 'CREDITO_VEHICULAR', nombre: 'Crédito vehicular', tasa: 12.5, max: 600_000, plazoMax: 84, plazoDef: 60, montoDef: 120_000 },
  { codigo: 'PRESTAMO_HIPOTECARIO', nombre: 'Préstamo hipotecario', tasa: 9.5, max: 3_000_000, plazoMax: 300, plazoDef: 240, montoDef: 600_000 },
] as const;

export default function PrestamosPage() {
  const [codigo, setCodigo] = useState<(typeof TIPOS)[number]['codigo']>('CREDITO_PERSONAL');
  const tipo = TIPOS.find((t) => t.codigo === codigo)!;
  const [monto, setMonto] = useState<number>(tipo.montoDef);
  const [meses, setMeses] = useState<number>(tipo.plazoDef);
  const [verTodo, setVerTodo] = useState(false);

  function cambiarTipo(c: string) {
    const t = TIPOS.find((x) => x.codigo === c)!;
    setCodigo(t.codigo);
    setMonto(t.montoDef);
    setMeses(t.plazoDef);
  }

  const montoValido = Math.min(tipo.max, Math.max(1_000, monto || 0));
  const mesesValido = Math.min(tipo.plazoMax, Math.max(6, meses || 0));
  const { cuota, filas } = useMemo(() => amortizar(montoValido, tipo.tasa, mesesValido), [montoValido, mesesValido, tipo.tasa]);
  const totalPagar = cuota * mesesValido;
  const intereses = totalPagar - montoValido;
  const visibles = verTodo ? filas : filas.slice(0, 12);

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
        <Card className="space-y-5">
          <SelectField label="Tipo de crédito" value={codigo} onChange={(e) => cambiarTipo(e.target.value)} options={TIPOS.map((t) => ({ value: t.codigo, label: `${t.nombre} · ${t.tasa}% anual` }))} />

          <div>
            <div className="flex items-end justify-between">
              <label htmlFor="monto" className="text-sm font-semibold">
                Monto
              </label>
              <span className="tabular text-lg font-bold">{formatMoney(montoValido)}</span>
            </div>
            <input id="monto" type="range" min={1000} max={tipo.max} step={1000} value={montoValido} onChange={(e) => setMonto(Number(e.target.value))} className="mt-2 w-full accent-[#5b8dff]" />
            <Field label="Monto exacto" type="number" min={1000} max={tipo.max} value={monto} onChange={(e) => setMonto(Number(e.target.value))} hint={`Entre ${formatMoney(1000)} y ${formatMoney(tipo.max)}`} />
          </div>

          <div>
            <div className="flex items-end justify-between">
              <label htmlFor="plazo" className="text-sm font-semibold">
                Plazo
              </label>
              <span className="text-lg font-bold">
                {mesesValido} meses <span className="text-sm font-normal text-muted">({(mesesValido / 12).toFixed(mesesValido % 12 === 0 ? 0 : 1)} años)</span>
              </span>
            </div>
            <input id="plazo" type="range" min={6} max={tipo.plazoMax} step={6} value={mesesValido} onChange={(e) => setMeses(Number(e.target.value))} className="mt-2 w-full accent-[#5b8dff]" />
          </div>
        </Card>

        <div className="space-y-4">
          <section className="rounded-2xl border border-l-4 border-line border-l-brand-600 bg-card p-6 shadow-card">
            <p className="text-sm text-muted">Tu cuota mensual estimada</p>
            <p className="tabular mt-1 text-4xl font-extrabold">{formatMoney(cuota)}</p>
            <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
              <Dato k="Total a pagar" v={formatMoney(totalPagar)} />
              <Dato k="Intereses" v={formatMoney(intereses)} />
              <Dato k="Tasa anual" v={`${tipo.tasa}%`} />
            </div>
            <div className="mt-4 h-3 overflow-hidden rounded-full bg-input" aria-hidden="true">
              <div className="h-full bg-brand-600" style={{ width: `${(montoValido / totalPagar) * 100}%` }} />
            </div>
            <p className="mt-1.5 text-xs text-muted">
              {((montoValido / totalPagar) * 100).toFixed(0)}% capital · {((intereses / totalPagar) * 100).toFixed(0)}% intereses
            </p>
          </section>
          <Card className="flex flex-wrap items-center justify-between gap-3 !p-4">
            <p className="text-sm text-muted">Cálculo referencial (sistema francés, cuota fija). La tasa real depende de tu evaluación.</p>
            <Link href="/productos" className="inline-flex min-h-11 items-center rounded-[10px] bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-accent-dark">
              Solicitar este crédito
            </Link>
          </Card>
        </div>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Tabla de amortización</h2>
        <div className="overflow-x-auto rounded-2xl border border-line bg-card">
          <table className="tabular w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-3">Cuota</th>
                <th className="px-4 py-3 text-right">Pago</th>
                <th className="px-4 py-3 text-right">Capital</th>
                <th className="px-4 py-3 text-right">Interés</th>
                <th className="px-4 py-3 text-right">Saldo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {visibles.map((f) => (
                <tr key={f.n}>
                  <td className="px-4 py-2.5 font-medium">{f.n}</td>
                  <td className="px-4 py-2.5 text-right">{formatMoney(f.cuota)}</td>
                  <td className="px-4 py-2.5 text-right">{formatMoney(f.capital)}</td>
                  <td className="px-4 py-2.5 text-right text-amarillo">{formatMoney(f.interes)}</td>
                  <td className="px-4 py-2.5 text-right text-muted">{formatMoney(f.saldo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filas.length > 12 && (
          <div className="mt-3 text-center">
            <button onClick={() => setVerTodo((v) => !v)} className="text-sm font-semibold text-brand-600 hover:underline">
              {verTodo ? 'Mostrar menos' : `Ver las ${filas.length} cuotas`}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

function Dato({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <p className="text-muted">{k}</p>
      <p className="tabular font-semibold">{v}</p>
    </div>
  );
}
