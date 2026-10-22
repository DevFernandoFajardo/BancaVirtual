'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field, SelectField } from '@/components/ui/Field';
import { PageLoader } from '@/components/ui/Spinner';
import type { Solicitud } from '@/interfaces/solicitud.interface';
import { errorMessage } from '@/lib/api';
import { PRODUCTOS } from '@/lib/productos';
import { perfilService } from '@/services/perfil/perfil.service';
import { solicitudesService } from '@/services/solicitudes/solicitudes.service';

// Gestión en curso del mismo producto: bloquea otra igual. Con la gestión completada (EMITIDA) se puede pedir de nuevo.
const VIGENTES = ['EN_EVALUACION', 'PENDIENTE_DECISION_CLIENTE', 'ACEPTADA'];

const EMPLEOS = [
  { value: 'Asalariado', label: 'Asalariado' },
  { value: 'Independiente', label: 'Independiente' },
];

const FORM_VACIO = {
  primerNombre: '',
  primerApellido: '',
  dpi: '',
  nit: '',
  fechaNacimiento: '',
  ingresosMensuales: '',
  tipoEmpleo: 'Asalariado',
  antiguedadLaboralMeses: '0',
  montoSolicitado: '',
  plazoMeses: '',
};

/** Préstamos que piden monto, con su rango (Q). La tarjeta de crédito no: el banco asigna el límite según tu perfil. */
const RANGO_MONTO: Record<string, { min: number; max: number; etiqueta: string; plazoMax: number; plazoDef: number }> = {
  CREDITO_PERSONAL: { min: 1_000, max: 300_000, etiqueta: 'Monto del préstamo (Q)', plazoMax: 60, plazoDef: 36 },
  CREDITO_VEHICULAR: { min: 1_000, max: 600_000, etiqueta: 'Monto del préstamo (Q)', plazoMax: 84, plazoDef: 60 },
  PRESTAMO_HIPOTECARIO: { min: 1_000, max: 3_000_000, etiqueta: 'Monto del préstamo (Q)', plazoMax: 300, plazoDef: 240 },
};

export default function ProductosPage() {
  const [solicitudes, setSolicitudes] = useState<Solicitud[] | null>(null);
  const [enviada, setEnviada] = useState(false);
  const [form, setForm] = useState(FORM_VACIO);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [seleccion, setSeleccion] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      setSolicitudes(await solicitudesService.listar());
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    cargar();
    // Prellena con los datos del perfil (el DPI y el NIT llegan enmascarados: se escriben a mano)
    perfilService
      .obtener()
      .then((c) =>
        setForm((f) => ({
          ...f,
          primerNombre: c.primerNombre,
          primerApellido: c.primerApellido,
          fechaNacimiento: c.fechaNacimiento ?? '',
          ingresosMensuales: c.ingresosMensuales ? String(c.ingresosMensuales) : '',
          tipoEmpleo: c.tipoEmpleo ?? 'Asalariado',
          antiguedadLaboralMeses: String(c.antiguedadLaboralMeses ?? 0),
        })),
      )
      .catch(() => {});
  }, [cargar]);

  // El aviso "Gestión enviada" se oculta solo a los 2 segundos
  useEffect(() => {
    if (!enviada) return;
    const t = setTimeout(() => setEnviada(false), 2000);
    return () => clearTimeout(t);
  }, [enviada]);

  const set = (k: keyof typeof FORM_VACIO) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const dpiOk = /^\d{13}$/.test(form.dpi);
  const nitOk = /^[0-9]{1,12}(-?[0-9Kk])?$/.test(form.nit);
  useEffect(() => {
    if (!seleccion) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !enviando && setSeleccion(null);
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [seleccion, enviando]);

  const rango = seleccion ? RANGO_MONTO[seleccion] : undefined;
  const montoNum = Number(form.montoSolicitado);
  const plazoNum = Number(form.plazoMeses);
  const plazoOk = !rango || (form.plazoMeses !== '' && Number.isInteger(plazoNum) && plazoNum >= 6 && plazoNum <= rango.plazoMax);
  const montoOk = !rango || (form.montoSolicitado !== '' && montoNum >= rango.min && montoNum <= rango.max);
  const formOk =
    !!form.primerNombre.trim() &&
    !!form.primerApellido.trim() &&
    dpiOk &&
    nitOk &&
    !!form.fechaNacimiento &&
    form.ingresosMensuales !== '' &&
    Number(form.ingresosMensuales) >= 0 &&
    form.antiguedadLaboralMeses !== '' &&
    montoOk &&
    plazoOk;

  async function enviar(codigo: string, e: React.FormEvent) {
    e.preventDefault();
    if (!formOk) return;
    setError('');
    setEnviando(true);
    try {
      await solicitudesService.crear({
        productoCodigo: codigo,
        primerNombre: form.primerNombre.trim(),
        primerApellido: form.primerApellido.trim(),
        dpi: form.dpi,
        nit: form.nit.trim(),
        fechaNacimiento: form.fechaNacimiento,
        ingresosMensuales: Number(form.ingresosMensuales),
        tipoEmpleo: form.tipoEmpleo,
        antiguedadLaboralMeses: Number(form.antiguedadLaboralMeses),
        ...(RANGO_MONTO[codigo] ? { montoSolicitado: Number(form.montoSolicitado), plazoMeses: Number(form.plazoMeses) } : {}),
      });
      setForm((f) => ({ ...f, dpi: '', nit: '', montoSolicitado: '', plazoMeses: '' }));
      setSeleccion(null);
      setEnviada(true);
      await cargar();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setEnviando(false);
    }
  }

  if (!solicitudes && !error) return <PageLoader />;

  return (
    <div className="space-y-8">
      {enviada && (
        <div className="pointer-events-none fixed inset-x-0 top-6 z-[60] flex justify-center px-4" role="status" aria-live="polite">
          <div className="flex items-center gap-3 rounded-2xl border border-verde/30 bg-card px-5 py-3.5 shadow-card">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-verde text-navy-900">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m5 12.5 4.5 4.5L19 7.5" />
              </svg>
            </span>
            <div>
              <p className="font-bold">¡Gestión enviada!</p>
              <p className="text-xs text-muted">Puedes darle seguimiento en Gestiones en línea.</p>
            </div>
          </div>
        </div>
      )}

      {error && <Alert tone="error">{error}</Alert>}

      <section>
        <h2 className="mb-3 text-lg font-semibold">Catálogo de productos</h2>
        <p className="mb-4 text-sm text-muted">Elige el producto que quieres solicitar.</p>
        {(['Tarjetas', 'Créditos', 'Precalificación'] as const).map((cat) => (
          <div key={cat} className="mb-5">
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">{cat}</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {PRODUCTOS.filter((p) => p.categoria === cat).map((p) => {
                const vigente = solicitudes?.find((s) => s.productoCodigo === p.codigo && VIGENTES.includes(s.estado));
                const activo = seleccion === p.codigo;
                return (
                  <Card key={p.codigo} className={`flex flex-col transition hover:-translate-y-0.5 hover:shadow-card ${activo ? 'ring-2 ring-brand-500' : ''}`}>
                    <h4 className="font-semibold">{p.nombre}</h4>
                    <p className="mt-1 flex-1 text-sm text-muted">{p.descripcion}</p>
                    {vigente ? (
                      <Link href="/gestiones" className="mt-4 block text-center text-sm font-semibold text-brand-600 hover:underline">
                        Ya tienes una gestión en curso · Ver gestión
                      </Link>
                    ) : (
                      <Button
                        className="mt-4"
                        onClick={() => setSeleccion(p.codigo)}
                      >
                        Solicitar
                      </Button>
                    )}
                  </Card>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      {seleccion && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-6"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !enviando) setSeleccion(null);
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="titulo-solicitud"
        >
          <div className="relative flex max-h-[94dvh] w-full max-w-2xl animate-[fadeUp_.22s_ease-out] flex-col overflow-hidden rounded-t-[24px] border border-line bg-card shadow-2xl sm:max-h-[90dvh] sm:rounded-[22px]">
            {/* Encabezado fijo */}
            <div className="relative shrink-0 border-b border-line px-5 pb-4 pt-5 sm:px-8 sm:pt-7">
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line sm:hidden" aria-hidden="true" />
              <button
                type="button"
                onClick={() => setSeleccion(null)}
                disabled={enviando}
                aria-label="Cerrar"
                className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-full text-muted transition hover:bg-white/10 hover:text-ink sm:right-5 sm:top-5"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
              <p className="text-[.7rem] font-extrabold uppercase tracking-[0.08em] text-brand-600">Nueva solicitud</p>
              <h2 id="titulo-solicitud" className="mt-1 pr-10 text-lg font-bold sm:text-xl">
                {PRODUCTOS.find((p) => p.codigo === seleccion)?.nombre}
              </h2>
              <p className="mt-1 text-[.82rem] text-muted">
                {rango
                  ? 'Cuéntanos cuánto necesitas y llena tus datos; evaluaremos tu perfil y tú decides si aceptas la oferta.'
                  : 'Llena tus datos; evaluaremos tu perfil y tú decides si aceptas la oferta. El límite lo define el banco según tu perfil.'}
              </p>
            </div>

            <form onSubmit={(e) => enviar(seleccion, e)} className="flex min-h-0 flex-1 flex-col" noValidate>
              {/* Campos: es lo único que se desplaza */}
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-5 sm:px-8">
            {rango && (
              <Field
                label={rango.etiqueta}
                type="number"
                inputMode="decimal"
                min={rango.min}
                max={rango.max}
                step="100"
                required
                value={form.montoSolicitado}
                onChange={set('montoSolicitado')}
                hint={`Entre ${rango.min.toLocaleString('es-GT')} y ${rango.max.toLocaleString('es-GT')}`}
                error={form.montoSolicitado !== '' && !montoOk ? 'Monto fuera del rango permitido' : undefined}
              />
            )}
            {rango && (
              <Field
                label="Plazo: número de cuotas (meses)"
                type="number"
                inputMode="numeric"
                min={6}
                max={rango.plazoMax}
                step="1"
                required
                value={form.plazoMeses}
                onChange={set('plazoMeses')}
                hint={`Entre 6 y ${rango.plazoMax} cuotas mensuales. El banco confirma las cuotas al aprobar.`}
                error={form.plazoMeses !== '' && !plazoOk ? `Elige entre 6 y ${rango.plazoMax} cuotas` : undefined}
              />
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Primer nombre" required value={form.primerNombre} onChange={set('primerNombre')} />
              <Field label="Primer apellido" required value={form.primerApellido} onChange={set('primerApellido')} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="DPI"
                inputMode="numeric"
                maxLength={13}
                required
                value={form.dpi}
                onChange={(e) => setForm((f) => ({ ...f, dpi: e.target.value.replace(/\D/g, '') }))}
                hint="13 dígitos"
                error={form.dpi && !dpiOk ? 'El DPI debe tener 13 dígitos' : undefined}
              />
              <Field
                label="NIT"
                required
                value={form.nit}
                onChange={set('nit')}
                placeholder="1234567-8"
                error={form.nit && !nitOk ? 'NIT inválido' : undefined}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Fecha de nacimiento"
                type="date"
                required
                value={form.fechaNacimiento}
                onChange={set('fechaNacimiento')}
                max={new Date().toISOString().slice(0, 10)}
              />
              <SelectField label="Tipo de empleo" options={EMPLEOS} value={form.tipoEmpleo} onChange={set('tipoEmpleo')} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Ingresos mensuales (Q)"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                required
                value={form.ingresosMensuales}
                onChange={set('ingresosMensuales')}
              />
              <Field
                label="Antigüedad laboral (meses)"
                type="number"
                inputMode="numeric"
                min={0}
                required
                value={form.antiguedadLaboralMeses}
                onChange={set('antiguedadLaboralMeses')}
              />
            </div>
              </div>

              {/* Botones siempre visibles */}
              <div className="grid shrink-0 grid-cols-2 gap-3 border-t border-line bg-card px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 sm:grid-cols-[1fr_2fr] sm:px-8 sm:pb-6">
                <Button type="button" variant="secondary" onClick={() => setSeleccion(null)} disabled={enviando}>
                  Cancelar
                </Button>
                <Button type="submit" loading={enviando} disabled={!formOk}>
                  Enviar solicitud
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
