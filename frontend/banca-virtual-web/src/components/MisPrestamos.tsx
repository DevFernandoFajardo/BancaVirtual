'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SelectField } from '@/components/ui/Field';
import type { ComprobantePrestamo, Prestamo, PrestamoDetalle } from '@/interfaces/banca.interface';
import type { Cuenta } from '@/interfaces/cuenta.interface';
import { errorMessage } from '@/lib/api';
import { TIPO_CUENTA_LABEL, formatCuenta, formatDay, formatMoney } from '@/lib/format';
import { prestamosService } from '@/services/banca.service';
import { cuentasService } from '@/services/cuentas/cuentas.service';

const dia = (iso: string) => formatDay(`${iso.slice(0, 10)}T12:00:00`);

/** Préstamos otorgados por el banco: avance, próxima cuota y pago de una o varias cuotas. */
export default function MisPrestamos() {
  const [prestamos, setPrestamos] = useState<Prestamo[] | null>(null);
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [error, setError] = useState('');
  const [pagando, setPagando] = useState<Prestamo | null>(null);
  const [viendo, setViendo] = useState<string | null>(null);
  const [detalles, setDetalles] = useState<Record<string, PrestamoDetalle>>({});
  const [recibo, setRecibo] = useState<ComprobantePrestamo | null>(null);

  const cargar = useCallback(async () => {
    try {
      const [p, c] = await Promise.all([prestamosService.listar(), cuentasService.listar()]);
      setPrestamos(p);
      setCuentas(c.filter((x) => x.estado === 'ACTIVA' && x.tipo !== 'PLAZO_FIJO'));
    } catch (err) {
      setError(errorMessage(err));
      setPrestamos((a) => a ?? []);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function verCuotas(id: string) {
    if (viendo === id) return setViendo(null);
    setViendo(id);
    try {
      const det = await prestamosService.detalle(id);
      setDetalles((d) => ({ ...d, [id]: det }));
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  if (!prestamos || prestamos.length === 0) {
    return error ? <Alert tone="error">{error}</Alert> : null;
  }

  return (
    <section className="space-y-4" aria-labelledby="mis-prestamos">
      <h2 id="mis-prestamos" className="text-lg font-semibold">
        Mis préstamos
      </h2>
      {error && <Alert tone="error">{error}</Alert>}

      {recibo && (
        <Card className="space-y-3 border-verde/40">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-verde-bg text-xl text-verde" aria-hidden="true">
              ✓
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-bold">{recibo.liquidado ? '¡Préstamo liquidado!' : 'Pago de préstamo realizado'}</p>
              <p className="text-sm text-muted">
                {formatMoney(recibo.monto)} · {recibo.cuotasPagadas} cuota{recibo.cuotasPagadas === 1 ? '' : 's'} ({recibo.desdeCuota === recibo.hastaCuota ? `#${recibo.desdeCuota}` : `#${recibo.desdeCuota} a #${recibo.hastaCuota}`}) · Ref. {recibo.referencia}
              </p>
              <p className="text-sm text-muted">
                Saldo del préstamo: {formatMoney(recibo.saldoPrestamo)} · Cuotas pendientes: {recibo.cuotasPendientes}
              </p>
            </div>
            <button onClick={() => setRecibo(null)} className="text-sm text-muted hover:text-ink" aria-label="Cerrar aviso">
              ×
            </button>
          </div>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {prestamos.map((p) => {
          const avance = (p.cuotasPagadas / p.cuotasTotal) * 100;
          const det = detalles[p.id];
          return (
            <Card key={p.id} className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-bold">{p.productoNombre}</p>
                  <p className="text-xs text-muted">
                    N.º {p.numero} · {p.tasaAnual}% anual · {formatMoney(p.monto)}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${p.estado === 'LIQUIDADO' ? 'bg-verde-bg text-verde' : 'bg-brand-50 text-brand-600'}`}>
                  {p.estado === 'LIQUIDADO' ? 'Liquidado' : 'Vigente'}
                </span>
              </div>

              <div>
                <div className="flex items-end justify-between text-sm">
                  <span className="font-semibold">
                    {p.cuotasPagadas} de {p.cuotasTotal} cuotas pagadas
                  </span>
                  <span className="text-muted">Saldo {formatMoney(p.saldoCapital)}</span>
                </div>
                <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-input" role="progressbar" aria-valuenow={Math.round(avance)} aria-valuemin={0} aria-valuemax={100}>
                  <div className="h-full rounded-full bg-verde transition-all" style={{ width: `${avance}%` }} />
                </div>
              </div>

              {p.proximaCuota ? (
                <div className="flex items-center justify-between rounded-xl bg-input/80 px-4 py-3 text-sm">
                  <div>
                    <p className="text-muted">Próxima cuota (#{p.proximaCuota.numero})</p>
                    <p className="font-semibold">Vence el {dia(p.proximaCuota.vence)}</p>
                  </div>
                  <p className="tabular text-lg font-bold">{formatMoney(p.proximaCuota.total)}</p>
                </div>
              ) : (
                <p className="rounded-xl bg-verde-bg px-4 py-3 text-sm font-medium text-verde">Este préstamo no tiene cuotas pendientes.</p>
              )}

              <div className="flex flex-wrap gap-3">
                {p.estado === 'VIGENTE' && (
                  <Button onClick={() => { setError(''); setRecibo(null); setPagando(p); }} disabled={cuentas.length === 0}>
                    Pagar cuotas
                  </Button>
                )}
                <Button variant="secondary" onClick={() => verCuotas(p.id)}>
                  {viendo === p.id ? 'Ocultar cuotas' : 'Ver cuotas'}
                </Button>
              </div>

              {viendo === p.id && (
                <div className="max-h-72 overflow-auto rounded-xl border border-line">
                  {!det ? (
                    <p className="p-4 text-sm text-muted">Cargando…</p>
                  ) : (
                    <table className="tabular w-full min-w-[420px] text-sm">
                      <thead className="sticky top-0 bg-card">
                        <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                          <th className="px-3 py-2">#</th>
                          <th className="px-3 py-2">Vence</th>
                          <th className="px-3 py-2 text-right">Cuota</th>
                          <th className="px-3 py-2 text-right">Estado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {det.cuotas.map((c) => (
                          <tr key={c.numero}>
                            <td className="px-3 py-2 font-medium">{c.numero}</td>
                            <td className="px-3 py-2">{dia(c.vence)}</td>
                            <td className="px-3 py-2 text-right">{formatMoney(c.total)}</td>
                            <td className={`px-3 py-2 text-right text-xs font-bold ${c.estado === 'PAGADA' ? 'text-verde' : 'text-muted'}`}>{c.estado === 'PAGADA' ? 'Pagada' : 'Pendiente'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {pagando && (
        <PagarCuotas
          prestamo={pagando}
          cuentas={cuentas}
          onCerrar={() => setPagando(null)}
          onPagado={async (r) => {
            setPagando(null);
            setRecibo(r);
            setDetalles({});
            setViendo(null);
            await cargar();
          }}
        />
      )}
    </section>
  );
}

function PagarCuotas({ prestamo, cuentas, onCerrar, onPagado }: { prestamo: Prestamo; cuentas: Cuenta[]; onCerrar: () => void; onPagado: (r: ComprobantePrestamo) => void }) {
  const [det, setDet] = useState<PrestamoDetalle | null>(null);
  const [cuentaId, setCuentaId] = useState(cuentas[0]?.id ?? '');
  const [n, setN] = useState(1);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    prestamosService.detalle(prestamo.id).then(setDet).catch((e) => setError(errorMessage(e)));
  }, [prestamo.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !enviando && onCerrar();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [enviando, onCerrar]);

  const pendientes = useMemo(() => (det?.cuotas ?? []).filter((c) => c.estado === 'PENDIENTE'), [det]);
  const max = pendientes.length || prestamo.cuotasPendientes;
  const cant = Math.min(Math.max(1, n || 1), max);
  const total = pendientes.slice(0, cant).reduce((a, c) => a + c.total, 0);
  const cuenta = cuentas.find((c) => c.id === cuentaId);
  const sinSaldo = !!cuenta && total > Number(cuenta.saldo);
  const atajos = [...new Set([1, 3, 6, 12, max].filter((x) => x <= max))];

  async function pagar() {
    setError('');
    setEnviando(true);
    try {
      onPagado(await prestamosService.pagar(prestamo.id, cuentaId, cant));
    } catch (err) {
      setError(errorMessage(err));
      setEnviando(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-6"
      onMouseDown={(e) => e.target === e.currentTarget && !enviando && onCerrar()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-pago-prestamo"
    >
      <div className="flex max-h-[94dvh] w-full max-w-md animate-[fadeUp_.22s_ease-out] flex-col overflow-hidden rounded-t-[24px] border border-line bg-card shadow-2xl sm:rounded-[22px]">
        <div className="shrink-0 border-b border-line px-5 pb-4 pt-5">
          <p className="text-[.7rem] font-extrabold uppercase tracking-[0.08em] text-brand-600">Pagar préstamo</p>
          <h2 id="titulo-pago-prestamo" className="mt-1 text-lg font-bold">
            {prestamo.productoNombre}
          </h2>
          <p className="text-xs text-muted">
            N.º {prestamo.numero} · {prestamo.cuotasPendientes} cuota{prestamo.cuotasPendientes === 1 ? '' : 's'} pendiente{prestamo.cuotasPendientes === 1 ? '' : 's'}
          </p>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 py-5">
          {error && <Alert tone="error">{error}</Alert>}

          <div>
            <p className="text-sm font-semibold">¿Cuántas cuotas quieres pagar?</p>
            <div className="mt-2 flex items-center gap-3">
              <button type="button" onClick={() => setN(Math.max(1, cant - 1))} disabled={cant <= 1} className="grid h-11 w-11 place-items-center rounded-xl border border-line bg-input text-xl disabled:opacity-40" aria-label="Menos cuotas">
                −
              </button>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={max}
                value={n}
                onChange={(e) => setN(Number(e.target.value))}
                className="tabular h-11 w-20 rounded-xl border border-line bg-input text-center text-lg font-bold focus:border-brand-500 focus:outline-none"
                aria-label="Cantidad de cuotas"
              />
              <button type="button" onClick={() => setN(Math.min(max, cant + 1))} disabled={cant >= max} className="grid h-11 w-11 place-items-center rounded-xl border border-line bg-input text-xl disabled:opacity-40" aria-label="Más cuotas">
                +
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {atajos.map((a) => (
                <button key={a} type="button" onClick={() => setN(a)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${cant === a ? 'border-brand-500 bg-brand-50 text-brand-600' : 'border-line text-muted hover:text-ink'}`}>
                  {a === max && max > 1 ? `Todas (${a})` : a === 1 ? '1 cuota' : `${a} cuotas`}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl bg-input/80 p-4 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted">
                {pendientes[0] ? `Cuota${cant === 1 ? '' : 's'} #${pendientes[0].numero}${cant > 1 ? ` a #${pendientes[cant - 1]?.numero}` : ''}` : 'Total a pagar'}
              </span>
              <span className="tabular text-2xl font-extrabold">{det ? formatMoney(total) : '…'}</span>
            </div>
            {cant === max && <p className="mt-1 text-xs text-verde">Con este pago liquidas el préstamo.</p>}
          </div>

          <SelectField
            label="Pagar con"
            value={cuentaId}
            onChange={(e) => setCuentaId(e.target.value)}
            options={cuentas.map((c) => ({ value: c.id, label: `${c.alias ?? TIPO_CUENTA_LABEL[c.tipo]} · ${formatCuenta(c.numero)} · ${formatMoney(c.saldo)}` }))}
          />
          {sinSaldo && <p className="-mt-3 text-xs text-rojo">El total supera el saldo de la cuenta.</p>}
        </div>

        <div className="grid shrink-0 grid-cols-2 gap-3 border-t border-line px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
          <Button variant="secondary" onClick={onCerrar} disabled={enviando}>
            Cancelar
          </Button>
          <Button onClick={pagar} loading={enviando} disabled={!det || !cuentaId || sinSaldo || total <= 0}>
            Pagar {det ? formatMoney(total) : ''}
          </Button>
        </div>
      </div>
    </div>
  );
}

