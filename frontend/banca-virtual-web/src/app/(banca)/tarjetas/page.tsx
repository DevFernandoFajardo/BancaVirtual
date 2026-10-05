'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field, SelectField } from '@/components/ui/Field';
import { PageLoader } from '@/components/ui/Spinner';
import type { Tarjeta, TarjetaDetalle } from '@/interfaces/banca.interface';
import type { Cuenta } from '@/interfaces/cuenta.interface';
import { errorMessage } from '@/lib/api';
import { TIPO_CUENTA_LABEL, formatCuenta, formatDate, formatMoney } from '@/lib/format';
import { cuentasService } from '@/services/cuentas/cuentas.service';
import { tarjetasService } from '@/services/banca.service';

export default function TarjetasPage() {
  const [tarjetas, setTarjetas] = useState<Tarjeta[] | null>(null);
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [sel, setSel] = useState<string>('');
  const [detalle, setDetalle] = useState<TarjetaDetalle | null>(null);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [panel, setPanel] = useState<'pagar' | 'compra' | null>(null);
  const [monto, setMonto] = useState('');
  const [comercio, setComercio] = useState('');
  const [cuentaId, setCuentaId] = useState('');
  const [trabajando, setTrabajando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const [t, c] = await Promise.all([tarjetasService.listar(), cuentasService.listar()]);
      setTarjetas(t);
      setSel((a) => a || t[0]?.id || '');
      const aptas = c.filter((x) => x.estado === 'ACTIVA' && x.tipo !== 'PLAZO_FIJO');
      setCuentas(aptas);
      setCuentaId((a) => a || aptas[0]?.id || '');
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  const cargarDetalle = useCallback(async (id: string) => {
    if (!id) return setDetalle(null);
    try {
      setDetalle(await tarjetasService.detalle(id));
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);
  useEffect(() => {
    cargarDetalle(sel);
  }, [sel, cargarDetalle]);

  async function ejecutar(fn: () => Promise<unknown>, mensaje: string) {
    setError('');
    setOk('');
    setTrabajando(true);
    try {
      await fn();
      setOk(mensaje);
      setMonto('');
      setComercio('');
      setPanel(null);
      await Promise.all([cargar(), cargarDetalle(sel)]);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setTrabajando(false);
    }
  }

  if (!tarjetas && !error) return <PageLoader />;

  if (tarjetas && tarjetas.length === 0) {
    return (
      <Card className="mx-auto max-w-xl space-y-3 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-2xl" aria-hidden="true">
          💳
        </span>
        <h2 className="text-lg font-semibold">Aún no tienes tarjetas</h2>
        <p className="text-sm text-muted">
          Solicita una tarjeta de crédito, acepta la oferta y, cuando el banco complete el trámite, aparecerá aquí con su límite y movimientos.
        </p>
        <div className="flex justify-center gap-3">
          <Link href="/productos" className="inline-flex min-h-11 items-center rounded-[10px] bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-accent-dark">
            Solicitar una tarjeta
          </Link>
          <Link href="/gestiones" className="inline-flex min-h-11 items-center rounded-[10px] border border-line bg-input px-5 text-sm font-semibold hover:border-muted">
            Ver mis gestiones
          </Link>
        </div>
      </Card>
    );
  }

  const t = detalle ?? tarjetas?.find((x) => x.id === sel);
  const usado = t ? (t.saldoUtilizado / t.limite) * 100 : 0;
  const montoNum = Number(monto);
  const cuenta = cuentas.find((c) => c.id === cuentaId);

  return (
    <div className="space-y-6">
      {tarjetas && tarjetas.length > 1 && (
        <div className="flex gap-2 overflow-x-auto">
          {tarjetas.map((x) => (
            <button
              key={x.id}
              onClick={() => setSel(x.id)}
              className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold ${sel === x.id ? 'border-brand-600 bg-brand-50 text-brand-600' : 'border-line bg-card text-muted hover:text-ink'}`}
            >
              {x.productoNombre} ·· {x.ultimos4}
            </button>
          ))}
        </div>
      )}

      {error && <Alert tone="error">{error}</Alert>}
      {ok && <Alert tone="success">{ok}</Alert>}

      {t && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
          <div className="space-y-4">
            <div
              className={`relative aspect-[1.586/1] w-full overflow-hidden rounded-[22px] p-6 text-white shadow-[0_24px_50px_-24px_rgba(20,40,110,0.8)] ${t.estado === 'BLOQUEADA' ? 'grayscale' : ''}`}
              style={{ background: 'linear-gradient(135deg,#1c2f66 0%,#3f6be0 55%,#5b8dff 100%)' }}
            >
              <div className="absolute -right-10 -top-10 h-44 w-44 rounded-full bg-white/10" />
              <div className="absolute -bottom-16 left-10 h-52 w-52 rounded-full bg-white/[0.07]" />
              <div className="relative flex h-full flex-col justify-between">
                <div className="flex items-start justify-between">
                  <span className="text-sm font-bold tracking-wide">BancaVirtual</span>
                  <span className="text-xs font-semibold opacity-90">{t.productoNombre}</span>
                </div>
                <div>
                  <div className="mb-3 h-8 w-11 rounded-md bg-gradient-to-br from-amber-200 to-amber-400/90" />
                  <p className="tabular text-xl tracking-[0.18em]">•••• •••• •••• {t.ultimos4}</p>
                </div>
                <div className="flex items-end justify-between text-xs">
                  <div>
                    <p className="opacity-70">TITULAR</p>
                    <p className="font-semibold tracking-wide">{t.titular}</p>
                  </div>
                  <div className="text-right">
                    <p className="opacity-70">VENCE</p>
                    <p className="font-semibold">{t.vencimiento}</p>
                  </div>
                </div>
                {t.estado === 'BLOQUEADA' && (
                  <span className="absolute right-0 top-9 rounded-l-full bg-rojo px-3 py-1 text-xs font-bold">BLOQUEADA</span>
                )}
              </div>
            </div>

            <Card className="space-y-3 !p-5">
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-xs text-muted">Crédito disponible</p>
                  <p className="tabular text-2xl font-bold text-verde">{formatMoney(t.disponible)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted">Límite</p>
                  <p className="tabular font-semibold">{formatMoney(t.limite)}</p>
                </div>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-input" role="progressbar" aria-valuenow={Math.round(usado)} aria-valuemin={0} aria-valuemax={100} aria-label="Crédito utilizado">
                <div className={`h-full rounded-full ${usado > 85 ? 'bg-rojo' : usado > 60 ? 'bg-amarillo' : 'bg-brand-600'}`} style={{ width: `${Math.min(100, usado)}%` }} />
              </div>
              <p className="text-xs text-muted">
                Saldo a pagar: <b className="tabular text-ink">{formatMoney(t.saldoUtilizado)}</b> ({usado.toFixed(0)}% del límite)
              </p>
            </Card>

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setPanel(panel === 'pagar' ? null : 'pagar')} disabled={t.saldoUtilizado <= 0}>
                Pagar tarjeta
              </Button>
              {t.estado === 'ACTIVA' ? (
                <Button variant="danger" loading={trabajando} onClick={() => ejecutar(() => tarjetasService.bloquear(t.id), 'Tarjeta bloqueada.')}>
                  Bloquear
                </Button>
              ) : (
                <Button variant="secondary" loading={trabajando} onClick={() => ejecutar(() => tarjetasService.desbloquear(t.id), 'Tarjeta desbloqueada.')}>
                  Desbloquear
                </Button>
              )}
              <Button variant="ghost" onClick={() => setPanel(panel === 'compra' ? null : 'compra')} disabled={t.estado !== 'ACTIVA'}>
                Simular compra
              </Button>
            </div>

            {panel === 'pagar' && (
              <Card className="space-y-4 !p-5">
                <form
                  className="space-y-4"
                  onSubmit={(e: FormEvent) => {
                    e.preventDefault();
                    ejecutar(() => tarjetasService.pagar(t.id, cuentaId, montoNum), `Pagaste ${formatMoney(montoNum)} a tu tarjeta.`);
                  }}
                >
                  <SelectField
                    label="Pagar desde"
                    value={cuentaId}
                    onChange={(e) => setCuentaId(e.target.value)}
                    options={cuentas.map((c) => ({ value: c.id, label: `${c.alias ?? TIPO_CUENTA_LABEL[c.tipo]} · ${formatCuenta(c.numero)} · ${formatMoney(c.saldo)}` }))}
                  />
                  <Field
                    label="Monto (Q)"
                    type="number"
                    inputMode="decimal"
                    min={1}
                    step="0.01"
                    value={monto}
                    onChange={(e) => setMonto(e.target.value)}
                    hint={`Saldo a pagar: ${formatMoney(t.saldoUtilizado)}`}
                    error={cuenta && montoNum > Number(cuenta.saldo) ? 'El monto supera el saldo de la cuenta' : montoNum > t.saldoUtilizado ? 'El monto supera tu saldo a pagar' : undefined}
                  />
                  <div className="flex gap-2">
                    <Button type="button" variant="secondary" onClick={() => setMonto(String(t.saldoUtilizado))}>
                      Pagar todo
                    </Button>
                    <Button type="submit" loading={trabajando} disabled={montoNum < 1 || montoNum > t.saldoUtilizado || !cuenta || montoNum > Number(cuenta.saldo)}>
                      Pagar
                    </Button>
                  </div>
                </form>
              </Card>
            )}

            {panel === 'compra' && (
              <Card className="space-y-4 !p-5">
                <form
                  className="space-y-4"
                  onSubmit={(e: FormEvent) => {
                    e.preventDefault();
                    ejecutar(() => tarjetasService.consumoDemo(t.id, montoNum, comercio.trim() || undefined), 'Compra de demostración registrada.');
                  }}
                >
                  <Field label="Comercio (opcional)" maxLength={80} value={comercio} onChange={(e) => setComercio(e.target.value)} placeholder="Ej. Supermercado" />
                  <Field label="Monto (Q)" type="number" inputMode="decimal" min={1} step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} hint="Solo demostración: simula un consumo para poder probar el pago." />
                  <Button type="submit" loading={trabajando} disabled={montoNum < 1 || montoNum > t.disponible}>
                    Registrar compra
                  </Button>
                </form>
              </Card>
            )}
          </div>

          <section>
            <h2 className="mb-3 text-lg font-semibold">Movimientos de la tarjeta</h2>
            {!detalle || detalle.movimientos.length === 0 ? (
              <Card className="text-center text-sm text-muted">Esta tarjeta aún no tiene movimientos.</Card>
            ) : (
              <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
                {detalle.movimientos.map((m) => (
                  <li key={m.id} className="flex items-start justify-between gap-4 px-4 py-3.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{m.descripcion}</p>
                      <p className="mt-0.5 text-xs text-muted">{formatDate(m.fecha)}</p>
                    </div>
                    <p className={`tabular shrink-0 text-sm font-semibold ${m.tipo === 'PAGO' ? 'text-verde' : ''}`}>
                      {m.tipo === 'PAGO' ? '+' : '−'}
                      {formatMoney(m.monto)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
