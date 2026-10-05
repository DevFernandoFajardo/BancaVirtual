'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { GestionStepper, pasosDeGestion } from '@/components/GestionStepper';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PageLoader } from '@/components/ui/Spinner';
import type { Solicitud } from '@/interfaces/solicitud.interface';
import { errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { ESTADO_SOLICITUD_LABEL, PRODUCTOS } from '@/lib/productos';
import { solicitudesService } from '@/services/solicitudes/solicitudes.service';

const CHIP: Record<string, string> = {
  EN_EVALUACION: 'border-brand-600/25 bg-brand-50 text-brand-600',
  PENDIENTE_DECISION_CLIENTE: 'border-amarillo/25 bg-amarillo-bg text-amarillo',
  ACEPTADA: 'border-brand-600/25 bg-brand-50 text-brand-600',
  EMITIDA: 'border-verde/25 bg-verde-bg text-verde',
  RECHAZADA_POR_POLITICAS: 'border-rojo/25 bg-rojo-bg text-rojo',
  RECHAZADA_POR_CLIENTE: 'border-line bg-input text-muted',
  CANCELADA: 'border-rojo/25 bg-rojo-bg text-rojo',
};

export default function GestionesPage() {
  const [gestiones, setGestiones] = useState<Solicitud[] | null>(null);
  const [cargadoEn, setCargadoEn] = useState(() => Date.now());
  const [ahora, setAhora] = useState(() => Date.now());
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [trabajando, setTrabajando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      setGestiones(await solicitudesService.listar());
      setCargadoEn(Date.now());
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const hayEnEvaluacion = !!gestiones?.some((g) => g.estado === 'EN_EVALUACION');

  // Con una evaluación en curso: cuenta regresiva cada segundo y consulta al servidor cada 4 s
  useEffect(() => {
    if (!hayEnEvaluacion) return;
    const tick = setInterval(() => setAhora(Date.now()), 1000);
    const poll = setInterval(cargar, 4000);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [hayEnEvaluacion, cargar]);

  async function decidir(g: Solicitud, aceptar: boolean) {
    setError('');
    setAviso('');
    setTrabajando(g.id);
    try {
      await solicitudesService.decidir(g.id, aceptar);
      setAviso(
        aceptar
          ? 'Aceptaste la oferta. Tu gestión quedó en trámite y te avisaremos cuando el producto sea emitido.'
          : 'Rechazaste la oferta. Puedes volver a solicitar este producto cuando quieras.',
      );
      await cargar();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setTrabajando(null);
    }
  }

  if (!gestiones && !error) return <PageLoader />;

  return (
    <div className="space-y-6">
      {error && <Alert tone="error">{error}</Alert>}
      {aviso && <Alert tone="success">{aviso}</Alert>}

      {gestiones?.length === 0 ? (
        <Card className="space-y-3 py-10 text-center">
          <p className="font-semibold">Todavía no tienes gestiones</p>
          <p className="text-sm text-muted">Cada solicitud de un producto aparece aquí con su avance paso a paso.</p>
          <div>
            <Link
              href="/productos"
              className="inline-flex min-h-11 items-center rounded-[10px] bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-accent-dark"
            >
              Ver productos
            </Link>
          </div>
        </Card>
      ) : (
        <ul className="space-y-5">
          {gestiones?.map((g) => {
            const restantes = Math.max(0, g.segundosRestantes - Math.floor((ahora - cargadoEn) / 1000));
            return (
              <li key={g.id}>
                <Card className="space-y-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[.78rem] font-bold uppercase tracking-[0.06em] text-muted">Solicitud de producto</p>
                      <h2 className="mt-0.5 text-[1.15rem] font-bold">{PRODUCTOS.find((p) => p.codigo === g.productoCodigo)?.nombre ?? g.productoNombre ?? g.productoCodigo}</h2>
                      <p className="mt-0.5 text-xs text-muted">
                        Gestión #{g.evaluacionId} · {formatDate(g.createdAt)}
                      </p>
                    </div>
                    <span className={`rounded-full border px-3 py-1 text-[.82rem] font-bold ${CHIP[g.estado] ?? 'border-line text-muted'}`}>
                      {ESTADO_SOLICITUD_LABEL[g.estado] ?? g.estado}
                    </span>
                  </div>

                  <GestionStepper pasos={pasosDeGestion(g, restantes)} />

                  {g.puedeDecidir && (
                    <div className="space-y-3">
                      <Alert tone="success">
                        ¡Tu solicitud fue aprobada! <strong>Tú decides</strong> si deseas continuar con este producto.
                      </Alert>
                      <div className="flex flex-col gap-3 sm:flex-row">
                        <Button variant="danger" full onClick={() => decidir(g, false)} disabled={trabajando === g.id}>
                          No, gracias
                        </Button>
                        <Button full onClick={() => decidir(g, true)} loading={trabajando === g.id}>
                          Sí, aceptar oferta
                        </Button>
                      </div>
                    </div>
                  )}

                  {g.notaAdmin && <Alert tone="info">Nota del banco: {g.notaAdmin}</Alert>}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
