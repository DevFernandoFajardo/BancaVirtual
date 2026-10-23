'use client';

import { useEffect, useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import type { Cuenta } from '@/interfaces/cuenta.interface';
import { errorMessage } from '@/lib/api';
import { TIPO_CUENTA_LABEL, formatCuenta } from '@/lib/format';
import { cuentasService } from '@/services/cuentas/cuentas.service';
import { SelectField, Field } from '@/components/ui/Field';
import { formatFecha, hoyGT } from '@/lib/format';
import { OPCIONES_PERIODO, periodoDesdeOpcion, reporteEstadoDeCuenta, reporteGestiones, reporteTransferencias, type Periodo } from '@/lib/reportes';

type Clave = 'cuentas' | 'gestiones' | 'transferencias';

const REPORTES: { clave: Clave; titulo: string; descripcion: string; color: string; icono: string; generar: (p: Periodo, cuentaId: string) => Promise<number> }[] = [
  {
    clave: 'cuentas',
    titulo: 'Estado de cuenta',
    descripcion: 'Saldo inicial y final, créditos, débitos y cada movimiento de la cuenta que elijas.',
    color: '#3a7fd5',
    icono: 'M4 5h16v14H4zM4 10h16M8 15h3',
    generar: (p, cuentaId) => reporteEstadoDeCuenta(p, cuentaId),
  },
  {
    clave: 'gestiones',
    titulo: 'Gestiones',
    descripcion: 'Tus solicitudes de tarjetas y créditos con su resultado y el estado en que van.',
    color: '#8b6cf0',
    icono: 'M9 4h6l1 2h3v14H5V6h3zM9 12l2 2 4-4',
    generar: (p) => reporteGestiones(p),
  },
  {
    clave: 'transferencias',
    titulo: 'Transferencias realizadas',
    descripcion: 'Las transferencias que enviaste y recibiste, con referencia, cuentas y montos.',
    color: '#16a673',
    icono: 'M4 8h14l-3-3M20 16H6l3 3',
    generar: (p) => reporteTransferencias(p),
  },
];

export default function ReportesPage() {
  const [cargando, setCargando] = useState<Clave | null>(null);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [cuentaId, setCuentaId] = useState('');
  useEffect(() => {
    cuentasService
      .listar()
      .then((c) => {
        setCuentas(c);
        setCuentaId((a) => a || c[0]?.id || '');
      })
      .catch(() => undefined);
  }, []);
  const [opcion, setOpcion] = useState('3');
  const [cDesde, setCDesde] = useState(hoyGT(-7));
  const [cHasta, setCHasta] = useState(hoyGT(0));
  const hoy = hoyGT(0);
  const personalizado = opcion === 'custom';
  const errorRango = !personalizado
    ? ''
    : !cDesde || !cHasta
      ? 'Elige las dos fechas.'
      : cDesde > cHasta
        ? 'La fecha inicial no puede ser mayor que la final.'
        : cHasta > hoy
          ? 'La fecha final no puede ser futura.'
          : (new Date(cHasta).getTime() - new Date(cDesde).getTime()) / 86_400_000 > 366
            ? 'El rango máximo es de un año.'
            : '';
  const periodo = periodoDesdeOpcion(opcion, { desde: cDesde, hasta: cHasta });

  async function descargar(r: (typeof REPORTES)[number]) {
    setError('');
    setOk('');
    setCargando(r.clave);
    try {
      const n = await r.generar(periodo, cuentaId);
      setOk(`Tu reporte de ${r.titulo.toLowerCase()} se descargó en PDF (${n} ${n === 1 ? 'registro' : 'registros'}).`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setCargando(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-line bg-gradient-to-r from-[#3a7fd5]/20 to-[#4fc0c2]/10 p-5">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#5fb7e0]">Mis reportes</p>
        <p className="mt-1 text-lg font-semibold">Elige el periodo</p>
        <p className="text-sm text-muted">
          Del {formatFecha(periodo.desde)} al {formatFecha(periodo.hasta)}. Se descargan en PDF listos para guardar o imprimir.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,260px)_1fr_1fr]">
          <SelectField
            label="Periodo"
            value={opcion}
            onChange={(e) => setOpcion(e.target.value)}
            options={[...OPCIONES_PERIODO.map((o) => ({ value: o.valor, label: o.texto })), { value: 'custom', label: 'Personalizado…' }]}
          />
          {personalizado && (
            <>
              <Field label="Desde" type="date" value={cDesde} max={hoy} onChange={(e) => setCDesde(e.target.value)} />
              <Field label="Hasta" type="date" value={cHasta} max={hoy} onChange={(e) => setCHasta(e.target.value)} />
            </>
          )}
        </div>
        {errorRango && <p className="mt-2 text-sm text-rojo">{errorRango}</p>}
      </div>

      {error && <Alert tone="error">{error}</Alert>}
      {ok && <Alert tone="success">{ok}</Alert>}

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {REPORTES.map((r) => (
          <Card key={r.clave} className="flex flex-col gap-4">
            <span className="grid h-12 w-12 place-items-center rounded-xl" style={{ background: `${r.color}26`, color: r.color }}>
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d={r.icono} />
              </svg>
            </span>
            <div className="flex-1">
              <h3 className="text-base font-semibold">{r.titulo}</h3>
              <p className="mt-1 text-sm text-muted">{r.descripcion}</p>
            </div>
            {r.clave === 'cuentas' && (
              <SelectField
                label="Cuenta"
                value={cuentaId}
                onChange={(e) => setCuentaId(e.target.value)}
                options={cuentas.map((c) => ({ value: c.id, label: `${TIPO_CUENTA_LABEL[c.tipo]} · ${formatCuenta(c.numero)}` }))}
              />
            )}
            <Button onClick={() => descargar(r)} loading={cargando === r.clave} disabled={cargando !== null || !!errorRango || (r.clave === 'cuentas' && !cuentaId)} full>
              {cargando === r.clave ? 'Generando PDF…' : 'Descargar PDF'}
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}
