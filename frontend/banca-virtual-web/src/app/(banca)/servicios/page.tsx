'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { DownloadIcon } from '@/components/icons';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field, SelectField } from '@/components/ui/Field';
import { PageLoader } from '@/components/ui/Spinner';
import type { ComprobantePago, PagoServicio, Servicio } from '@/interfaces/banca.interface';
import type { Cuenta } from '@/interfaces/cuenta.interface';
import { errorMessage } from '@/lib/api';
import { TIPO_CUENTA_LABEL, formatCuenta, formatDate, formatMoney } from '@/lib/format';
import { descargarComprobante } from '@/lib/pdf';
import { serviciosService } from '@/services/banca.service';
import { cuentasService } from '@/services/cuentas/cuentas.service';

const EMOJI: Record<string, string> = { Energía: '💡', Agua: '💧', Telefonía: '📱', Internet: '🌐', Gobierno: '🏛️' };

export default function ServiciosPage() {
  const [catalogo, setCatalogo] = useState<Servicio[] | null>(null);
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [historial, setHistorial] = useState<PagoServicio[]>([]);
  const [error, setError] = useState('');
  const [seleccion, setSeleccion] = useState<Servicio | null>(null);
  const [contrato, setContrato] = useState('');
  const [monto, setMonto] = useState('');
  const [cuentaId, setCuentaId] = useState('');
  const [pagando, setPagando] = useState(false);
  const [recibo, setRecibo] = useState<ComprobantePago | null>(null);
  const [bajando, setBajando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const [s, c, h] = await Promise.all([serviciosService.catalogo(), cuentasService.listar(), serviciosService.historial(1, 8)]);
      setCatalogo(s);
      const aptas = c.filter((x) => x.estado === 'ACTIVA' && x.tipo !== 'PLAZO_FIJO');
      setCuentas(aptas);
      setCuentaId((a) => a || aptas[0]?.id || '');
      setHistorial(h.items);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const categorias = useMemo(() => {
    const m = new Map<string, Servicio[]>();
    for (const s of catalogo ?? []) m.set(s.categoria, [...(m.get(s.categoria) ?? []), s]);
    return [...m.entries()];
  }, [catalogo]);

  const cuenta = cuentas.find((c) => c.id === cuentaId);
  const montoNum = Number(monto);
  const valido = !!seleccion && contrato.trim().length >= 4 && /^[A-Za-z0-9\-_.]+$/.test(contrato.trim()) && montoNum >= 1 && !!cuenta && montoNum <= Number(cuenta.saldo);

  async function pagar(e: FormEvent) {
    e.preventDefault();
    if (!seleccion) return;
    setError('');
    setPagando(true);
    try {
      setRecibo(await serviciosService.pagar({ servicioCodigo: seleccion.codigo, contrato: contrato.trim(), monto: montoNum, cuentaId }));
      setSeleccion(null);
      setContrato('');
      setMonto('');
      await cargar();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPagando(false);
    }
  }

  if (!catalogo && !error) return <PageLoader />;

  return (
    <div className="space-y-6">
      {error && <Alert tone="error">{error}</Alert>}

      {recibo && (
        <Card className="space-y-4">
          <div className="text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-verde-bg text-2xl text-verde" aria-hidden="true">
              ✓
            </span>
            <h2 className="mt-3 text-lg font-semibold">Pago realizado</h2>
            <p className="tabular text-3xl font-bold">{formatMoney(recibo.monto)}</p>
            <p className="text-sm text-muted">{recibo.servicio}</p>
          </div>
          <dl className="space-y-2 text-sm">
            <Fila k="Referencia" v={recibo.referencia} />
            <Fila k="Contrato" v={recibo.contrato} />
            <Fila k="Fecha" v={formatDate(recibo.fecha)} />
            <Fila k="Saldo de tu cuenta" v={formatMoney(recibo.saldoDespues)} />
          </dl>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              variant="secondary"
              full
              loading={bajando}
              onClick={async () => {
                setBajando(true);
                try {
                  await descargarComprobante({ tipo: 'PAGO', c: recibo });
                } finally {
                  setBajando(false);
                }
              }}
            >
              <DownloadIcon width={18} height={18} /> Descargar comprobante
            </Button>
            <Button full onClick={() => setRecibo(null)}>
              Pagar otro servicio
            </Button>
          </div>
        </Card>
      )}

      {!recibo && !seleccion && (
        <section className="space-y-5">
          {cuentas.length === 0 && <Alert tone="info">Necesitas una cuenta activa para pagar servicios.</Alert>}
          {categorias.map(([cat, items]) => (
            <div key={cat}>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">{cat}</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((s) => (
                  <button
                    key={s.codigo}
                    onClick={() => setSeleccion(s)}
                    disabled={cuentas.length === 0}
                    className="flex items-center gap-3 rounded-2xl border border-line bg-card p-4 text-left shadow-card transition hover:-translate-y-0.5 hover:border-brand-600 disabled:opacity-50"
                  >
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-xl" aria-hidden="true">
                      {EMOJI[cat] ?? '🧾'}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold">{s.nombre}</span>
                      <span className="text-xs text-muted">{s.referenciaEtiqueta}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {seleccion && (
        <Card className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Pagar servicio</p>
              <h2 className="text-lg font-semibold">{seleccion.nombre}</h2>
            </div>
            <button onClick={() => setSeleccion(null)} className="text-sm text-muted hover:text-ink">
              ← Cambiar
            </button>
          </div>
          <form onSubmit={pagar} className="space-y-4" noValidate>
            <Field label={seleccion.referenciaEtiqueta} required maxLength={40} value={contrato} onChange={(e) => setContrato(e.target.value)} hint="Solo letras, números y guiones (mínimo 4)" />
            <Field
              label="Monto a pagar (Q)"
              type="number"
              inputMode="decimal"
              min={1}
              max={50000}
              step="0.01"
              required
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              error={cuenta && montoNum > Number(cuenta.saldo) ? 'El monto supera el saldo de la cuenta' : undefined}
            />
            <SelectField
              label="Pagar con"
              value={cuentaId}
              onChange={(e) => setCuentaId(e.target.value)}
              options={cuentas.map((c) => ({ value: c.id, label: `${c.alias ?? TIPO_CUENTA_LABEL[c.tipo]} · ${formatCuenta(c.numero)} · ${formatMoney(c.saldo)}` }))}
            />
            <Button type="submit" full loading={pagando} disabled={!valido}>
              Pagar {montoNum > 0 ? formatMoney(montoNum) : ''}
            </Button>
          </form>
        </Card>
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold">Historial de pagos</h2>
        {historial.length === 0 ? (
          <Card className="text-center text-sm text-muted">Aún no has pagado servicios.</Card>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
            {historial.map((p) => (
              <li key={p.id} className="flex items-start justify-between gap-4 px-4 py-3.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{p.servicio}</p>
                  <p className="mt-0.5 truncate text-xs text-muted">
                    {formatDate(p.fecha)} · Contrato {p.contrato} · {p.referencia}
                  </p>
                  <button
                    onClick={() =>
                      descargarComprobante({
                        tipo: 'PAGO',
                        c: { referencia: p.referencia, servicio: p.servicio, contrato: p.contrato, monto: p.monto, cuentaOrigen: p.cuentaOrigen, saldoDespues: 0, fecha: p.fecha },
                      })
                    }
                    className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline"
                  >
                    <DownloadIcon width={13} height={13} /> Comprobante PDF
                  </button>
                </div>
                <p className="tabular shrink-0 text-sm font-semibold">−{formatMoney(p.monto)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Fila({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-muted">{k}</dt>
      <dd className="text-right font-medium">{v}</dd>
    </div>
  );
}
