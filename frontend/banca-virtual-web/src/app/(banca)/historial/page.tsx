'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field, SelectField } from '@/components/ui/Field';
import { PageLoader } from '@/components/ui/Spinner';
import type { CategoriaHistorial, Cuenta, FiltroHistorial, HistorialItem } from '@/interfaces/cuenta.interface';
import { errorMessage } from '@/lib/api';
import { TIPO_CUENTA_LABEL, formatCuenta, formatMoney, hoyGT } from '@/lib/format';
import { cuentasService } from '@/services/cuentas/cuentas.service';

const PAGE = 20;

const CATEGORIAS: { v: CategoriaHistorial | ''; l: string }[] = [
  { v: '', l: 'Todos los movimientos' },
  { v: 'TRANSFERENCIA', l: 'Transferencias' },
  { v: 'DEPOSITO', l: 'Depósitos y abonos' },
  { v: 'SERVICIO', l: 'Pagos de servicios' },
  { v: 'PRESTAMO', l: 'Préstamos' },
  { v: 'TARJETA', l: 'Pagos de tarjeta' },
  { v: 'PLAZO', l: 'Plazo fijo' },
  { v: 'OTRO', l: 'Otros' },
];
const ETIQUETA: Record<CategoriaHistorial, string> = {
  TRANSFERENCIA: 'Transferencia',
  DEPOSITO: 'Depósito',
  SERVICIO: 'Servicio',
  PRESTAMO: 'Préstamo',
  TARJETA: 'Tarjeta',
  PLAZO: 'Plazo fijo',
  OTRO: 'Otro',
};

const PERIODOS = [
  { v: '7', l: '7 días' },
  { v: '30', l: '30 días' },
  { v: '90', l: '90 días' },
  { v: 'todo', l: 'Todo' },
];

const diaGT = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala' }).format(new Date(iso));
const horaGT = (iso: string) => new Intl.DateTimeFormat('es-GT', { timeZone: 'America/Guatemala', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
function tituloDia(ymd: string) {
  if (ymd === hoyGT()) return 'Hoy';
  if (ymd === hoyGT(-1)) return 'Ayer';
  return new Intl.DateTimeFormat('es-GT', { dateStyle: 'full' }).format(new Date(`${ymd}T12:00:00`));
}

export default function HistorialPage() {
  const [cuentas, setCuentas] = useState<Cuenta[] | null>(null);
  const [cuentaId, setCuentaId] = useState('');
  const [categoria, setCategoria] = useState<CategoriaHistorial | ''>('');
  const [tipo, setTipo] = useState<'' | 'CREDITO' | 'DEBITO'>('');
  const [periodo, setPeriodo] = useState('30');
  const [q, setQ] = useState('');
  const [qAplicada, setQAplicada] = useState('');
  const [items, setItems] = useState<HistorialItem[]>([]);
  const [total, setTotal] = useState(0);
  const [entradas, setEntradas] = useState('0');
  const [salidas, setSalidas] = useState('0');
  const [cargando, setCargando] = useState(true);
  const [masCargando, setMasCargando] = useState(false);
  const [error, setError] = useState('');
  const pagina = useRef(1);
  const solicitud = useRef(0);

  const filtro = useMemo<FiltroHistorial>(
    () => ({
      cuentaId: cuentaId || undefined,
      categoria: categoria || undefined,
      tipo: tipo || undefined,
      desde: periodo === 'todo' ? undefined : hoyGT(-Number(periodo)),
      q: qAplicada.trim() || undefined,
    }),
    [cuentaId, categoria, tipo, periodo, qAplicada],
  );

  useEffect(() => {
    cuentasService.listar().then(setCuentas).catch(() => setCuentas([]));
  }, []);

  // Búsqueda con pequeña espera para no consultar en cada tecla
  useEffect(() => {
    const t = setTimeout(() => setQAplicada(q), 350);
    return () => clearTimeout(t);
  }, [q]);

  const cargar = useCallback(async () => {
    const id = ++solicitud.current;
    setCargando(true);
    setError('');
    try {
      const r = await cuentasService.historial(filtro, 1, PAGE);
      if (id !== solicitud.current) return;
      pagina.current = 1;
      setItems(r.items);
      setTotal(r.total);
      setEntradas(r.entradas);
      setSalidas(r.salidas);
    } catch (err) {
      if (id === solicitud.current) setError(errorMessage(err));
    } finally {
      if (id === solicitud.current) setCargando(false);
    }
  }, [filtro]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function verMas() {
    setMasCargando(true);
    try {
      const r = await cuentasService.historial(filtro, pagina.current + 1, PAGE);
      pagina.current += 1;
      setItems((prev) => [...prev, ...r.items]);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setMasCargando(false);
    }
  }

  const grupos = useMemo(() => {
    const m = new Map<string, HistorialItem[]>();
    for (const it of items) {
      const d = diaGT(it.createdAt);
      m.set(d, [...(m.get(d) ?? []), it]);
    }
    return [...m.entries()];
  }, [items]);

  if (!cuentas) return <PageLoader />;

  const hayFiltros = !!(cuentaId || categoria || tipo || qAplicada.trim() || periodo !== '30');

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Card className="!p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Entradas</p>
          <p className="tabular mt-1 text-xl font-bold text-verde sm:text-2xl">+ {formatMoney(entradas)}</p>
        </Card>
        <Card className="!p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Salidas</p>
          <p className="tabular mt-1 text-xl font-bold text-rojo sm:text-2xl">− {formatMoney(salidas)}</p>
        </Card>
      </div>

      <Card className="space-y-3 !p-4">
        <div role="radiogroup" aria-label="Periodo" className="grid grid-cols-4 gap-1 rounded-xl border border-line bg-input p-1">
          {PERIODOS.map((p) => (
            <button
              key={p.v}
              type="button"
              role="radio"
              aria-checked={periodo === p.v}
              onClick={() => setPeriodo(p.v)}
              className={`rounded-lg px-2 py-1.5 text-sm font-semibold transition-colors ${periodo === p.v ? 'bg-brand-600 text-white' : 'text-muted hover:text-ink'}`}
            >
              {p.l}
            </button>
          ))}
        </div>
        <div role="radiogroup" aria-label="Tipo" className="grid grid-cols-3 gap-1 rounded-xl border border-line bg-input p-1">
          {([['', 'Todo'], ['CREDITO', 'Entradas'], ['DEBITO', 'Salidas']] as const).map(([v, l]) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={tipo === v}
              onClick={() => setTipo(v)}
              className={`rounded-lg px-2 py-1.5 text-sm font-semibold transition-colors ${tipo === v ? 'bg-brand-600 text-white' : 'text-muted hover:text-ink'}`}
            >
              {l}
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField
            className="!min-h-10 !py-2 text-sm"
            label="Cuenta"
            value={cuentaId}
            onChange={(e) => setCuentaId(e.target.value)}
            options={[{ value: '', label: 'Todas mis cuentas' }, ...cuentas.map((c) => ({ value: c.id, label: `${c.alias ?? TIPO_CUENTA_LABEL[c.tipo]} · ${formatCuenta(c.numero)}` }))]}
          />
          <SelectField
            className="!min-h-10 !py-2 text-sm"
            label="Tipo de movimiento"
            value={categoria}
            onChange={(e) => setCategoria(e.target.value as CategoriaHistorial | '')}
            options={CATEGORIAS.map((c) => ({ value: c.v, label: c.l }))}
          />
        </div>
        <Field className="!min-h-10 !py-2 text-sm" label="Buscar" value={q} onChange={(e) => setQ(e.target.value)} maxLength={60} placeholder="Descripción o referencia" />
      </Card>

      {error && <Alert tone="error">{error}</Alert>}

      {cargando ? (
        <PageLoader />
      ) : items.length === 0 ? (
        <Card className="text-center text-sm text-muted">{hayFiltros ? 'No hay movimientos con esos filtros.' : 'Aún no tienes movimientos.'}</Card>
      ) : (
        <>
          <p className="px-1 text-xs text-muted">
            {total} {total === 1 ? 'movimiento' : 'movimientos'}
          </p>
          {grupos.map(([dia, lista]) => (
            <section key={dia} className="space-y-1.5">
              <h2 className="px-1 text-xs font-bold uppercase tracking-wide text-muted first-letter:uppercase">{tituloDia(dia)}</h2>
              <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
                {lista.map((m) => {
                  const entra = m.tipo === 'CREDITO';
                  return (
                    <li key={m.id} className="flex items-center gap-3 px-4 py-3">
                      <span
                        aria-hidden="true"
                        className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-lg font-bold ${entra ? 'bg-verde-bg text-verde' : 'bg-rojo-bg text-rojo'}`}
                      >
                        {entra ? '↓' : '↑'}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm font-semibold leading-snug">{m.descripcion}</p>
                        <p className="text-xs leading-snug text-muted">
                          {ETIQUETA[m.categoria]} · {m.cuentaAlias ?? TIPO_CUENTA_LABEL[m.cuentaTipo]} {formatCuenta(m.cuentaNumero)} · {horaGT(m.createdAt)}
                        </p>
                        {m.referencia && <p className="truncate text-[11px] text-muted/80">Ref. {m.referencia}</p>}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className={`tabular text-sm font-bold ${entra ? 'text-verde' : 'text-ink'}`}>
                          {entra ? '+' : '−'} {formatMoney(m.monto, m.moneda)}
                        </p>
                        <p className="tabular text-[11px] text-muted">Saldo {formatMoney(m.saldoPosterior, m.moneda)}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          {items.length < total && (
            <Button variant="secondary" full loading={masCargando} onClick={verMas}>
              Ver más movimientos
            </Button>
          )}
        </>
      )}
    </div>
  );
}
