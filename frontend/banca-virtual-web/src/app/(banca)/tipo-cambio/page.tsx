'use client';

import { useEffect, useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Card } from '@/components/ui/Card';
import { Field, SelectField } from '@/components/ui/Field';
import { PageLoader } from '@/components/ui/Spinner';
import type { TipoCambio } from '@/interfaces/banca.interface';
import { errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { extrasService } from '@/services/banca.service';

const BANDERA: Record<string, string> = { USD: '🇺🇸', EUR: '🇪🇺', MXN: '🇲🇽', CAD: '🇨🇦', GBP: '🇬🇧' };

export default function TipoCambioPage() {
  const [data, setData] = useState<TipoCambio | null>(null);
  const [error, setError] = useState('');
  const [moneda, setMoneda] = useState('USD');
  const [monto, setMonto] = useState('100');
  const [sentido, setSentido] = useState<'comprar' | 'vender'>('comprar');

  useEffect(() => {
    extrasService
      .tipoCambio()
      .then(setData)
      .catch((err) => setError(errorMessage(err)));
  }, []);

  if (!data && !error) return <PageLoader />;
  if (!data) return <Alert tone="error">{error}</Alert>;

  const tasa = data.tasas.find((t) => t.moneda === moneda)!;
  const n = Number(monto) || 0;
  // "Comprar divisas": el banco las vende (tasa de venta). "Vender divisas": el banco las compra.
  const resultado = sentido === 'comprar' ? n * tasa.venta : n * tasa.compra;
  const q = (v: number) => new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ', currencyDisplay: 'narrowSymbol' }).format(v);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.tasas.map((t) => (
          <Card key={t.moneda} className="!p-5">
            <div className="flex items-center gap-3">
              <span className="text-3xl" aria-hidden="true">
                {BANDERA[t.moneda] ?? '💱'}
              </span>
              <div>
                <p className="font-bold">{t.moneda}</p>
                <p className="text-xs text-muted">{t.nombre}</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-input p-3">
                <p className="text-xs text-muted">Compra</p>
                <p className="tabular text-lg font-bold">Q{t.compra.toFixed(2)}</p>
              </div>
              <div className="rounded-xl bg-input p-3">
                <p className="text-xs text-muted">Venta</p>
                <p className="tabular text-lg font-bold">Q{t.venta.toFixed(2)}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card className="max-w-2xl space-y-4">
        <h2 className="text-lg font-semibold">Conversor</h2>
        <div className="grid grid-cols-2 gap-1 rounded-xl border border-line bg-input p-1" role="radiogroup">
          {(['comprar', 'vender'] as const).map((s) => (
            <button key={s} role="radio" aria-checked={sentido === s} onClick={() => setSentido(s)} className={`rounded-lg px-3 py-2 text-sm font-semibold ${sentido === s ? 'bg-brand-600 text-white' : 'text-muted hover:text-ink'}`}>
              {s === 'comprar' ? 'Quiero comprar divisas' : 'Quiero vender divisas'}
            </button>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="Moneda" value={moneda} onChange={(e) => setMoneda(e.target.value)} options={data.tasas.map((t) => ({ value: t.moneda, label: `${t.moneda} · ${t.nombre}` }))} />
          <Field label={`Cantidad en ${moneda}`} type="number" inputMode="decimal" min={0} step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} />
        </div>
        <div className="rounded-xl border border-line bg-input p-5 text-center">
          <p className="text-sm text-muted">{sentido === 'comprar' ? 'Pagarías' : 'Recibirías'}</p>
          <p className="tabular text-3xl font-extrabold">{q(resultado)}</p>
          <p className="mt-1 text-xs text-muted">a Q{(sentido === 'comprar' ? tasa.venta : tasa.compra).toFixed(2)} por {moneda}</p>
        </div>
      </Card>

      <p className="text-xs text-muted">Tasas de referencia simuladas para este proyecto académico · actualizado {formatDate(data.actualizado)}.</p>
    </div>
  );
}
