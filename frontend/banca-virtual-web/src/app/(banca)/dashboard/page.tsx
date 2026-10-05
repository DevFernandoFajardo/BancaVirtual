'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { CuentaCard } from '@/components/CuentaCard';
import { BoltIcon, ClipboardIcon, SendIcon, WalletIcon } from '@/components/icons';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field, SelectField } from '@/components/ui/Field';
import { PageLoader } from '@/components/ui/Spinner';
import type { Cuenta } from '@/interfaces/cuenta.interface';
import { errorMessage } from '@/lib/api';
import { TIPO_CUENTA_LABEL, formatCuenta, formatFecha, formatMoney } from '@/lib/format';
import { PLAZOS_FIJO, interesPlazo } from '@/lib/plazos';
import { cuentasService } from '@/services/cuentas/cuentas.service';
import { estadoCuentaService } from '@/services/banca.service';

type Panel = 'cuenta' | 'plazo' | null;

export default function DashboardPage() {
  const [cuentas, setCuentas] = useState<Cuenta[] | null>(null);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [panel, setPanel] = useState<Panel>(null);
  const [guardando, setGuardando] = useState(false);

  const [tipo, setTipo] = useState<'MONETARIA' | 'AHORRO'>('MONETARIA');
  const [alias, setAlias] = useState('');

  const [origenId, setOrigenId] = useState('');
  const [monto, setMonto] = useState('');
  const [meses, setMeses] = useState(6);

  const cargar = useCallback(async () => {
    try {
      const c = await cuentasService.listar();
      setCuentas(c);
      setOrigenId((a) => a || c.find((x) => x.estado === 'ACTIVA' && x.tipo !== 'PLAZO_FIJO')?.id || '');
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const origenes = useMemo(() => (cuentas ?? []).filter((c) => c.estado === 'ACTIVA' && c.tipo !== 'PLAZO_FIJO'), [cuentas]);
  const origen = origenes.find((c) => c.id === origenId);
  const plazo = PLAZOS_FIJO.find((p) => p.meses === meses)!;
  const montoNum = Number(monto);
  const montoOk = montoNum >= 1000 && !!origen && montoNum <= Number(origen.saldo);

  async function abrirCuenta(e: FormEvent) {
    e.preventDefault();
    setError('');
    setOk('');
    setGuardando(true);
    try {
      await cuentasService.abrir({ tipo, alias: alias.trim() || undefined });
      setAlias('');
      setPanel(null);
      setOk('¡Cuenta abierta! Ya puedes usarla.');
      await cargar();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setGuardando(false);
    }
  }

  async function constituirPlazo(e: FormEvent) {
    e.preventDefault();
    setError('');
    setOk('');
    setGuardando(true);
    try {
      await estadoCuentaService.constituirPlazoFijo(origenId, montoNum, meses);
      setMonto('');
      setPanel(null);
      setOk(`¡Plazo fijo constituido! Ganará ${plazo.tasa}% anual a ${meses} meses.`);
      await cargar();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setGuardando(false);
    }
  }

  if (!cuentas && !error) return <PageLoader />;

  const total = (cuentas ?? []).filter((c) => c.moneda === 'GTQ').reduce((s, c) => s + Number(c.saldo), 0);
  const disponible = (cuentas ?? []).filter((c) => c.tipo !== 'PLAZO_FIJO').reduce((s, c) => s + Number(c.saldo), 0);
  const invertido = (cuentas ?? []).filter((c) => c.tipo === 'PLAZO_FIJO').reduce((s, c) => s + Number(c.saldo), 0);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-l-4 border-line border-l-brand-600 bg-card p-6 shadow-card">
        <p className="text-sm text-muted">Saldo total en quetzales</p>
        <p className="tabular mt-1 text-4xl font-extrabold">{formatMoney(total)}</p>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted">
          <span>
            Disponible <b className="tabular text-ink">{formatMoney(disponible)}</b>
          </span>
          {invertido > 0 && (
            <span>
              Invertido a plazo <b className="tabular text-ink">{formatMoney(invertido)}</b>
            </span>
          )}
          <span>{cuentas?.length ?? 0} cuenta(s)</span>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Accesos rápidos">
        <Acceso href="/transferencias" icono={<SendIcon />} titulo="Transferir" texto="A tus cuentas o a terceros" />
        <Acceso href="/servicios" icono={<BoltIcon />} titulo="Pagar servicios" texto="Luz, agua, teléfono…" />
        <Acceso href="/tarjetas" icono={<WalletIcon />} titulo="Mis tarjetas" texto="Límite, saldo y pagos" />
        <Acceso href="/gestiones" icono={<ClipboardIcon />} titulo="Gestiones" texto="Sigue tus solicitudes" />
      </section>

      {error && <Alert tone="error">{error}</Alert>}
      {ok && <Alert tone="success">{ok}</Alert>}

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Mis cuentas</h2>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setPanel(panel === 'plazo' ? null : 'plazo')}>
              {panel === 'plazo' ? 'Cancelar' : 'Plazo fijo'}
            </Button>
            <Button variant="secondary" onClick={() => setPanel(panel === 'cuenta' ? null : 'cuenta')}>
              {panel === 'cuenta' ? 'Cancelar' : 'Abrir otra cuenta'}
            </Button>
          </div>
        </div>

        {panel === 'cuenta' && (
          <Card className="mb-4">
            <form onSubmit={abrirCuenta} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <SelectField
                label="Tipo de cuenta"
                value={tipo}
                onChange={(e) => setTipo(e.target.value as 'MONETARIA' | 'AHORRO')}
                options={[
                  { value: 'MONETARIA', label: 'Monetaria' },
                  { value: 'AHORRO', label: 'Ahorro' },
                ]}
              />
              <Field label="Nombre (opcional)" maxLength={40} value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="Ej. Gastos del mes" />
              <Button type="submit" loading={guardando}>
                Abrir cuenta
              </Button>
            </form>
          </Card>
        )}

        {panel === 'plazo' && (
          <Card className="mb-4 space-y-4">
            <div>
              <h3 className="font-semibold">Constituir un plazo fijo</h3>
              <p className="text-sm text-muted">Tu dinero genera intereses al vencimiento. Desde Q1,000.</p>
            </div>
            <form onSubmit={constituirPlazo} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField
                  label="Debitar de"
                  value={origenId}
                  onChange={(e) => setOrigenId(e.target.value)}
                  options={origenes.map((c) => ({
                    value: c.id,
                    label: `${c.alias ?? TIPO_CUENTA_LABEL[c.tipo]} · ${formatCuenta(c.numero)} · ${formatMoney(c.saldo)}`,
                  }))}
                />
                <Field
                  label="Monto a invertir (Q)"
                  type="number"
                  inputMode="decimal"
                  min={1000}
                  step="0.01"
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  error={origen && montoNum > Number(origen.saldo) ? 'El monto supera el saldo de la cuenta' : undefined}
                />
              </div>
              <div>
                <p className="mb-2 text-sm font-semibold">Plazo</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {PLAZOS_FIJO.map((p) => (
                    <button
                      type="button"
                      key={p.meses}
                      onClick={() => setMeses(p.meses)}
                      className={`rounded-xl border p-3 text-left transition ${meses === p.meses ? 'border-brand-600 bg-brand-50' : 'border-line bg-input hover:border-muted'}`}
                    >
                      <span className="block text-sm font-bold">{p.meses} meses</span>
                      <span className="text-xs text-muted">{p.tasa}% anual</span>
                    </button>
                  ))}
                </div>
              </div>
              {montoNum >= 1000 && (
                <div className="rounded-xl border border-line bg-input p-4 text-sm">
                  Recibirás <b className="tabular text-verde">{formatMoney(interesPlazo(montoNum, plazo.tasa, meses))}</b> de intereses y un total de{' '}
                  <b className="tabular">{formatMoney(montoNum + interesPlazo(montoNum, plazo.tasa, meses))}</b> al vencimiento.
                  <span className="mt-1 block text-xs text-muted">Si lo cancelas antes de tiempo, recuperas tu capital sin intereses.</span>
                </div>
              )}
              <Button type="submit" loading={guardando} disabled={!montoOk}>
                Constituir plazo fijo
              </Button>
            </form>
          </Card>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {cuentas?.map((c) => <CuentaCard key={c.id} cuenta={c} />)}
        </div>
        {(cuentas ?? []).some((c) => c.tipo === 'PLAZO_FIJO' && c.fechaVencimiento) && (
          <p className="mt-3 text-xs text-muted">
            Próximo vencimiento:{' '}
            {formatFecha(
              (cuentas ?? [])
                .filter((c) => c.tipo === 'PLAZO_FIJO' && c.fechaVencimiento)
                .map((c) => c.fechaVencimiento!)
                .sort()[0],
            )}
            .
          </p>
        )}
      </section>
    </div>
  );
}

function Acceso({ href, icono, titulo, texto }: { href: string; icono: ReactNode; titulo: string; texto: string }) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-line bg-card p-4 shadow-card transition hover:-translate-y-0.5 hover:border-brand-600"
    >
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-600 transition group-hover:bg-brand-600 group-hover:text-white">{icono}</span>
      <p className="mt-3 text-sm font-bold">{titulo}</p>
      <p className="text-xs text-muted">{texto}</p>
    </Link>
  );
}

