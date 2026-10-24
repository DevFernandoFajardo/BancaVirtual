'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PageLoader } from '@/components/ui/Spinner';
import type { CategoriaHistorial, FiltroHistorial, HistorialItem } from '@/interfaces/cuenta.interface';
import { errorMessage } from '@/lib/api';
import { TIPO_CUENTA_LABEL, formatCuenta, formatMoney, hoyGT } from '@/lib/format';
import { cuentasService } from '@/services/cuentas/cuentas.service';

const PAGE = 20;

const ETIQUETA: Record<CategoriaHistorial, string> = {
  TRANSFERENCIA: 'Transferencia',
  DEPOSITO: 'Depósito',
  SERVICIO: 'Servicio',
  PRESTAMO: 'Préstamo',
  TARJETA: 'Tarjeta',
  PLAZO: 'Plazo fijo',
  OTRO: 'Otro',
};

const diaGT = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala' }).format(new Date(iso));
const horaGT = (iso: string) => new Intl.DateTimeFormat('es-GT', { timeZone: 'America/Guatemala', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
function tituloDia(ymd: string) {
  if (ymd === hoyGT()) return 'Hoy';
  if (ymd === hoyGT(-1)) return 'Ayer';
  return new Intl.DateTimeFormat('es-GT', { dateStyle: 'full' }).format(new Date(`${ymd}T12:00:00`));
}

export default function HistorialPage() {
  const [items, setItems] = useState<HistorialItem[]>([]);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [masCargando, setMasCargando] = useState(false);
  const [error, setError] = useState('');
  const pagina = useRef(1);
  const solicitud = useRef(0);

  const filtro = useMemo<FiltroHistorial>(() => ({}), []);

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

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      {error && <Alert tone="error">{error}</Alert>}

      {cargando ? (
        <PageLoader />
      ) : items.length === 0 ? (
        <Card className="text-center text-sm text-muted">Aún no tienes movimientos.</Card>
      ) : (
        <>
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
