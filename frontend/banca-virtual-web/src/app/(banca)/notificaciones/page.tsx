'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ICONO_NOTIF } from '@/components/NotificationBell';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PageLoader } from '@/components/ui/Spinner';
import type { Notificacion } from '@/interfaces/banca.interface';
import { errorMessage } from '@/lib/api';
import { formatDate, formatRelativo } from '@/lib/format';
import { notificacionesService } from '@/services/banca.service';

export default function NotificacionesPage() {
  const router = useRouter();
  const [data, setData] = useState<{ items: Notificacion[]; noLeidas: number } | null>(null);
  const [soloNoLeidas, setSoloNoLeidas] = useState(false);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    try {
      setData(await notificacionesService.listar());
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function abrir(n: Notificacion) {
    if (!n.leida) await notificacionesService.leer(n.id).catch(() => undefined);
    if (n.enlace) router.push(n.enlace);
    else cargar();
  }

  if (!data && !error) return <PageLoader />;
  const items = (data?.items ?? []).filter((n) => !soloNoLeidas || !n.leida);

  return (
    <div className="space-y-5">
      {error && <Alert tone="error">{error}</Alert>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-xl border border-line bg-card p-1" role="tablist">
          <button role="tab" aria-selected={!soloNoLeidas} onClick={() => setSoloNoLeidas(false)} className={`rounded-lg px-4 py-2 text-sm font-semibold ${!soloNoLeidas ? 'bg-brand-600 text-white' : 'text-muted'}`}>
            Todas
          </button>
          <button role="tab" aria-selected={soloNoLeidas} onClick={() => setSoloNoLeidas(true)} className={`rounded-lg px-4 py-2 text-sm font-semibold ${soloNoLeidas ? 'bg-brand-600 text-white' : 'text-muted'}`}>
            Sin leer{data && data.noLeidas > 0 ? ` (${data.noLeidas})` : ''}
          </button>
        </div>
        {data && data.noLeidas > 0 && (
          <Button
            variant="secondary"
            onClick={async () => {
              await notificacionesService.leerTodas();
              await cargar();
            }}
          >
            Marcar todas como leídas
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <Card className="text-center text-sm text-muted">{soloNoLeidas ? 'No tienes notificaciones sin leer.' : 'Aún no tienes notificaciones.'}</Card>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
          {items.map((n) => (
            <li key={n.id}>
              <button onClick={() => abrir(n)} className="flex w-full items-start gap-4 px-4 py-4 text-left transition-colors hover:bg-brand-50">
                <span className="mt-0.5 text-2xl" aria-hidden="true">
                  {ICONO_NOTIF[n.tipo] ?? '🔔'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className={`text-sm ${n.leida ? 'font-medium' : 'font-bold'}`}>{n.titulo}</span>
                    {!n.leida && <span className="h-2 w-2 rounded-full bg-brand-600" />}
                  </span>
                  <span className="mt-0.5 block text-sm text-muted">{n.mensaje}</span>
                  <span className="mt-1 block text-xs text-muted" title={formatDate(n.createdAt)}>
                    {formatRelativo(n.createdAt)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
