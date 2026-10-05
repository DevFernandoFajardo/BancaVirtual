'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Notificacion } from '@/interfaces/banca.interface';
import { formatRelativo } from '@/lib/format';
import { notificacionesService } from '@/services/banca.service';
import { BellIcon } from './icons';

export const ICONO_NOTIF: Record<string, string> = {
  GESTION: '📋',
  MOVIMIENTO: '💸',
  PAGO: '🧾',
  TARJETA: '💳',
  SEGURIDAD: '🔒',
  BANCO: '🏦',
};

/** Campanita con contador. Consulta el contador cada 30 s y la lista al abrir. */
export function NotificationBell() {
  const router = useRouter();
  const [noLeidas, setNoLeidas] = useState(0);
  const [abierta, setAbierta] = useState(false);
  const [items, setItems] = useState<Notificacion[] | null>(null);
  const caja = useRef<HTMLDivElement>(null);

  const refrescarContador = useCallback(async () => {
    try {
      setNoLeidas((await notificacionesService.resumen()).noLeidas);
    } catch {
      /* sin conexión: se reintenta */
    }
  }, []);

  useEffect(() => {
    refrescarContador();
    const t = setInterval(refrescarContador, 30_000);
    return () => clearInterval(t);
  }, [refrescarContador]);

  useEffect(() => {
    if (!abierta) return;
    notificacionesService
      .listar()
      .then((r) => {
        setItems(r.items.slice(0, 8));
        setNoLeidas(r.noLeidas);
      })
      .catch(() => setItems([]));
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierta(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setAbierta(false);
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('keydown', esc);
    };
  }, [abierta]);

  async function abrirNotif(n: Notificacion) {
    setAbierta(false);
    if (!n.leida) {
      setNoLeidas((v) => Math.max(0, v - 1));
      notificacionesService.leer(n.id).catch(() => undefined);
    }
    if (n.enlace) router.push(n.enlace);
  }

  async function leerTodas() {
    await notificacionesService.leerTodas().catch(() => undefined);
    setNoLeidas(0);
    setItems((prev) => prev?.map((i) => ({ ...i, leida: true })) ?? null);
  }

  return (
    <div ref={caja} className="relative">
      <button
        onClick={() => setAbierta((v) => !v)}
        className="relative grid h-[38px] w-[38px] place-items-center rounded-[10px] border border-line bg-input text-ink transition-colors hover:border-brand-600"
        aria-label={`Notificaciones${noLeidas ? `, ${noLeidas} sin leer` : ''}`}
        aria-expanded={abierta}
      >
        <BellIcon width={18} height={18} />
        {noLeidas > 0 && (
          <span className="absolute -right-1 -top-1 grid min-w-[18px] place-items-center rounded-full bg-rojo px-1 text-[.68rem] font-bold leading-[18px] text-white">
            {noLeidas > 9 ? '9+' : noLeidas}
          </span>
        )}
      </button>

      {abierta && (
        <div className="fixed inset-x-3 top-[68px] z-50 overflow-hidden rounded-2xl border border-line bg-card shadow-[0_24px_60px_-20px_rgba(0,0,0,0.6)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-[46px] sm:w-[380px]">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="font-semibold">Notificaciones</p>
            {noLeidas > 0 && (
              <button onClick={leerTodas} className="text-xs font-semibold text-brand-600 hover:underline">
                Marcar todas como leídas
              </button>
            )}
          </div>
          <div className="max-h-[420px] overflow-y-auto">
            {items === null ? (
              <p className="px-4 py-8 text-center text-sm text-muted">Cargando…</p>
            ) : items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted">No tienes notificaciones.</p>
            ) : (
              <ul className="divide-y divide-line">
                {items.map((n) => (
                  <li key={n.id}>
                    <button onClick={() => abrirNotif(n)} className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-brand-50">
                      <span className="mt-0.5 text-lg" aria-hidden="true">
                        {ICONO_NOTIF[n.tipo] ?? '🔔'}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className={`truncate text-sm ${n.leida ? 'font-medium' : 'font-bold'}`}>{n.titulo}</span>
                          {!n.leida && <span className="h-2 w-2 shrink-0 rounded-full bg-brand-600" />}
                        </span>
                        <span className="mt-0.5 line-clamp-2 block text-[.82rem] text-muted">{n.mensaje}</span>
                        <span className="mt-1 block text-[.72rem] text-muted">{formatRelativo(n.createdAt)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Link href="/notificaciones" onClick={() => setAbierta(false)} className="block border-t border-line px-4 py-3 text-center text-sm font-semibold text-brand-600 hover:bg-brand-50">
            Ver todas
          </Link>
        </div>
      )}
    </div>
  );
}
