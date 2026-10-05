'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { DownloadIcon, SearchIcon } from '@/components/icons';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field, SelectField } from '@/components/ui/Field';
import { PageLoader } from '@/components/ui/Spinner';
import type { Cuenta, LiquidacionPlazo, Movimiento } from '@/interfaces/cuenta.interface';
import { errorMessage } from '@/lib/api';
import { TIPO_CUENTA_LABEL, formatCuenta, formatDate, formatFecha, formatMoney, hoyGT } from '@/lib/format';
import { descargarComprobante, descargarEstadoDeCuenta } from '@/lib/pdf';
import { interesPlazo } from '@/lib/plazos';
import { cuentasService } from '@/services/cuentas/cuentas.service';
import { estadoCuentaService } from '@/services/banca.service';

const PAGE_SIZE = 15;

export default function CuentaDetallePage() {
  const { id } = useParams<{ id: string }>();
  const [cuenta, setCuenta] = useState<Cuenta | null>(null);
  const [otras, setOtras] = useState<Cuenta[]>([]);
  const [movs, setMovs] = useState<Movimiento[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [copiado, setCopiado] = useState(false);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [cargandoMovs, setCargandoMovs] = useState(false);

  // Filtros del estado de cuenta
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [tipo, setTipo] = useState<'' | 'DEBITO' | 'CREDITO'>('');
  const [q, setQ] = useState('');
  const [qAplicada, setQAplicada] = useState('');
  const [generando, setGenerando] = useState(false);
  const [bajando, setBajando] = useState<string | null>(null);

  // Depósito demo / plazo fijo
  const [depositando, setDepositando] = useState(false);
  const [monto, setMonto] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [destinoId, setDestinoId] = useState('');
  const [liquidacion, setLiquidacion] = useState<LiquidacionPlazo | null>(null);

  const filtro = useMemo(() => ({ desde, hasta, tipo, q: qAplicada }), [desde, hasta, tipo, qAplicada]);
  const filtroRef = useRef(filtro);
  filtroRef.current = filtro;

  // Búsqueda de texto con pequeña espera para no consultar en cada tecla
  useEffect(() => {
    const t = setTimeout(() => setQAplicada(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);

  const cargarCuenta = useCallback(async () => {
    try {
      const [c, todas] = await Promise.all([cuentasService.obtener(id), cuentasService.listar()]);
      setCuenta(c);
      setOtras(todas.filter((x) => x.id !== id && x.estado === 'ACTIVA' && x.tipo !== 'PLAZO_FIJO'));
      setDestinoId((a) => a || todas.find((x) => x.id !== id && x.estado === 'ACTIVA' && x.tipo !== 'PLAZO_FIJO')?.id || '');
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [id]);

  const cargarMovs = useCallback(async () => {
    setCargandoMovs(true);
    try {
      const m = await estadoCuentaService.movimientos(id, filtroRef.current, 1, PAGE_SIZE);
      setMovs(m.items);
      setTotal(m.total);
      setPage(1);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setCargandoMovs(false);
    }
  }, [id]);

  useEffect(() => {
    cargarCuenta();
  }, [cargarCuenta]);

  useEffect(() => {
    cargarMovs();
  }, [cargarMovs, filtro]);

  async function cargarMas() {
    setCargandoMas(true);
    try {
      const m = await estadoCuentaService.movimientos(id, filtro, page + 1, PAGE_SIZE);
      setMovs((prev) => [...prev, ...m.items]);
      setPage(page + 1);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setCargandoMas(false);
    }
  }

  function preset(p: 'mes' | '30' | 'todo') {
    const hoy = hoyGT();
    if (p === 'todo') {
      setDesde('');
      setHasta('');
    } else if (p === 'mes') {
      setDesde(hoy.slice(0, 8) + '01');
      setHasta(hoy);
    } else {
      setDesde(hoyGT(-30));
      setHasta(hoy);
    }
  }

  async function descargarPdf() {
    setError('');
    setGenerando(true);
    try {
      const hoy = hoyGT();
      const e = await estadoCuentaService.estado(id, desde || cuenta?.createdAt.slice(0, 10) || undefined, hasta || hoy);
      await descargarEstadoDeCuenta(e);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setGenerando(false);
    }
  }

  async function bajarComprobante(m: Movimiento) {
    if (!m.referencia) return;
    setBajando(m.id);
    try {
      await descargarComprobante({ tipo: 'TRANSFERENCIA', c: await estadoCuentaService.comprobante(m.referencia) });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBajando(null);
    }
  }

  async function depositar(e: FormEvent) {
    e.preventDefault();
    setError('');
    setGuardando(true);
    try {
      await cuentasService.depositoDemo(id, Number(monto));
      setMonto('');
      setDepositando(false);
      await Promise.all([cargarCuenta(), cargarMovs()]);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setGuardando(false);
    }
  }

  async function liquidar() {
    setError('');
    setGuardando(true);
    try {
      setLiquidacion(await estadoCuentaService.liquidarPlazoFijo(id, destinoId));
      await Promise.all([cargarCuenta(), cargarMovs()]);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setGuardando(false);
    }
  }

  async function copiar() {
    if (!cuenta) return;
    try {
      await navigator.clipboard.writeText(cuenta.numero);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* el portapapeles puede no estar disponible */
    }
  }

  if (!cuenta && !error) return <PageLoader />;
  if (!cuenta) {
    return (
      <div className="space-y-4">
        <Alert tone="error">{error}</Alert>
        <Link href="/dashboard" className="text-sm font-semibold text-brand-700">
          ← Volver a mis cuentas
        </Link>
      </div>
    );
  }

  const plazo = cuenta.tipo === 'PLAZO_FIJO';
  const activa = cuenta.estado === 'ACTIVA';
  const hoy = hoyGT();
  const vencido = plazo && !!cuenta.fechaVencimiento && cuenta.fechaVencimiento <= hoy;
  const interes = plazo ? interesPlazo(Number(cuenta.capitalInicial ?? cuenta.saldo), Number(cuenta.tasaAnual ?? 0), cuenta.plazoMeses ?? 0) : 0;
  const hayFiltros = !!(desde || hasta || tipo || qAplicada);

  return (
    <div className="space-y-6">
      <Link href="/dashboard" className="text-sm font-semibold text-brand-700">
        ← Mis cuentas
      </Link>

      <section className="rounded-2xl border border-l-4 border-line border-l-brand-600 bg-card p-6 shadow-card">
        <p className="text-sm text-muted">{cuenta.alias ?? TIPO_CUENTA_LABEL[cuenta.tipo]}</p>
        <p className="tabular mt-1 text-4xl font-extrabold">{formatMoney(cuenta.saldo, cuenta.moneda)}</p>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted">
          <span>
            {TIPO_CUENTA_LABEL[cuenta.tipo]} · <span className="tabular">{formatCuenta(cuenta.numero)}</span>
          </span>
          <button onClick={copiar} className="rounded-lg border border-line bg-input px-2.5 py-1 text-xs font-medium text-ink hover:border-muted">
            {copiado ? '¡Copiado!' : 'Copiar número'}
          </button>
          {!activa && <span className="rounded-full bg-amarillo-bg px-2 py-0.5 text-xs font-medium text-amarillo">{cuenta.estado}</span>}
        </div>
      </section>

      {error && <Alert tone="error">{error}</Alert>}
      {ok && <Alert tone="success">{ok}</Alert>}

      {plazo && activa && (
        <Card className="space-y-4">
          <div className="grid gap-4 text-sm sm:grid-cols-4">
            <Dato k="Capital" v={formatMoney(cuenta.capitalInicial ?? cuenta.saldo)} />
            <Dato k="Plazo" v={`${cuenta.plazoMeses} meses`} />
            <Dato k="Tasa anual" v={`${cuenta.tasaAnual}%`} />
            <Dato k="Vence" v={cuenta.fechaVencimiento ? formatFecha(cuenta.fechaVencimiento) : '—'} />
          </div>
          <div className="rounded-xl border border-line bg-input p-4 text-sm">
            {vencido ? (
              <>
                Tu plazo fijo <b>ya venció</b>: al liquidarlo recibirás <b className="tabular text-verde">{formatMoney(Number(cuenta.capitalInicial) + interes)}</b> (incluye{' '}
                {formatMoney(interes)} de intereses).
              </>
            ) : (
              <>
                Al vencimiento ganarás <b className="tabular text-verde">{formatMoney(interes)}</b> de intereses. Si lo cancelas antes, recibes solo tu capital.
              </>
            )}
          </div>
          {liquidacion ? (
            <Alert tone="success">
              Plazo fijo liquidado: se acreditaron {formatMoney(liquidacion.total)} a la cuenta {formatCuenta(liquidacion.destino)}
              {liquidacion.vencido ? ` (intereses ${formatMoney(liquidacion.intereses)})` : ' sin intereses'}.
            </Alert>
          ) : otras.length === 0 ? (
            <Alert tone="info">Necesitas una cuenta monetaria o de ahorro activa para liquidar este plazo fijo.</Alert>
          ) : (
            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <SelectField
                label="Acreditar en"
                value={destinoId}
                onChange={(e) => setDestinoId(e.target.value)}
                options={otras.map((c) => ({ value: c.id, label: `${c.alias ?? TIPO_CUENTA_LABEL[c.tipo]} · ${formatCuenta(c.numero)}` }))}
              />
              <Button variant={vencido ? 'primary' : 'danger'} loading={guardando} onClick={liquidar}>
                {vencido ? 'Liquidar plazo fijo' : 'Cancelar anticipadamente'}
              </Button>
            </div>
          )}
        </Card>
      )}

      {!plazo && activa && (
        <div className="flex flex-wrap gap-3">
          <Link
            href="/transferencias"
            className="inline-flex min-h-11 items-center rounded-[10px] bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-accent-dark"
          >
            Transferir
          </Link>
          <Button variant="secondary" onClick={() => setDepositando((v) => !v)}>
            {depositando ? 'Cancelar' : 'Depósito de demostración'}
          </Button>
        </div>
      )}

      {depositando && (
        <Card>
          <form onSubmit={depositar} className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <Field
              label="Monto a depositar (Q)"
              type="number"
              inputMode="decimal"
              min={0.01}
              max={100000}
              step="0.01"
              required
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              hint="Simula un depósito en ventanilla para poder probar las transferencias."
            />
            <Button type="submit" loading={guardando} disabled={!monto || Number(monto) <= 0}>
              Depositar
            </Button>
          </form>
        </Card>
      )}

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Estado de cuenta</h2>
          <Button variant="secondary" onClick={descargarPdf} loading={generando}>
            <DownloadIcon width={18} height={18} /> Descargar PDF
          </Button>
        </div>

        <Card className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Desde" type="date" max={hasta || hoy} value={desde} onChange={(e) => setDesde(e.target.value)} />
            <Field label="Hasta" type="date" min={desde || undefined} max={hoy} value={hasta} onChange={(e) => setHasta(e.target.value)} />
            <SelectField
              label="Tipo"
              value={tipo}
              onChange={(e) => setTipo(e.target.value as '' | 'DEBITO' | 'CREDITO')}
              options={[
                { value: '', label: 'Todos' },
                { value: 'CREDITO', label: 'Créditos (ingresos)' },
                { value: 'DEBITO', label: 'Débitos (egresos)' },
              ]}
            />
            <div>
              <label className="block text-sm font-semibold" htmlFor="buscar-mov">
                Buscar
              </label>
              <div className="relative">
                <SearchIcon width={16} height={16} className="pointer-events-none absolute left-3 top-1/2 mt-[3px] -translate-y-1/2 text-muted" />
                <input
                  id="buscar-mov"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Descripción o referencia"
                  className="mt-1.5 block min-h-11 w-full rounded-[10px] border border-line bg-input py-2.5 pl-9 pr-3 text-ink placeholder:text-[#5c688c] focus:border-brand-500 focus:outline-none focus:ring-[3px] focus:ring-brand-600/20"
                />
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted">Atajos:</span>
            <Chip onClick={() => preset('mes')}>Este mes</Chip>
            <Chip onClick={() => preset('30')}>Últimos 30 días</Chip>
            <Chip onClick={() => preset('todo')}>Todo</Chip>
            {hayFiltros && (
              <button
                onClick={() => {
                  preset('todo');
                  setTipo('');
                  setQ('');
                }}
                className="ml-auto text-xs font-semibold text-brand-600 hover:underline"
              >
                Limpiar filtros
              </button>
            )}
          </div>
        </Card>

        {cargandoMovs && movs.length === 0 ? (
          <PageLoader />
        ) : movs.length === 0 ? (
          <Card className="text-center text-sm text-muted">{hayFiltros ? 'No hay movimientos con esos filtros.' : 'Esta cuenta aún no tiene movimientos.'}</Card>
        ) : (
          <>
            <p className="text-xs text-muted">
              {total} movimiento(s){hayFiltros ? ' con los filtros aplicados' : ''}
            </p>
            <ul className={`divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card ${cargandoMovs ? 'opacity-60' : ''}`}>
              {movs.map((m) => (
                <li key={m.id} className="flex items-start justify-between gap-4 px-4 py-3.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{m.descripcion}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {formatDate(m.createdAt)}
                      {m.referencia ? ` · ${m.referencia}` : ''}
                    </p>
                    {m.referencia?.startsWith('TRF-') && (
                      <button
                        onClick={() => bajarComprobante(m)}
                        disabled={bajando === m.id}
                        className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline disabled:opacity-50"
                      >
                        <DownloadIcon width={13} height={13} /> {bajando === m.id ? 'Generando…' : 'Comprobante PDF'}
                      </button>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={`tabular text-sm font-semibold ${m.tipo === 'CREDITO' ? 'text-verde' : 'text-ink'}`}>
                      {m.tipo === 'CREDITO' ? '+' : '−'}
                      {formatMoney(m.monto, cuenta.moneda)}
                    </p>
                    <p className="tabular text-xs text-muted">Saldo {formatMoney(m.saldoPosterior, cuenta.moneda)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
        {movs.length < total && (
          <div className="text-center">
            <Button variant="secondary" onClick={cargarMas} loading={cargandoMas}>
              Ver más movimientos
            </Button>
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
      <p className="mt-0.5 font-semibold">{v}</p>
    </div>
  );
}

function Chip({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="rounded-full border border-line bg-input px-3 py-1 text-xs font-medium hover:border-brand-600 hover:text-brand-600">
      {children}
    </button>
  );
}
