'use client';

import { useCallback, useEffect, useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { errorMessage } from '@/lib/api';
import { pushService } from '@/services/banca.service';

type Estado = 'cargando' | 'no-soportado' | 'ios-instalar' | 'deshabilitado' | 'denegado' | 'inactivo' | 'activo';

function aUint8(base64: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Tarjeta para activar/desactivar las alertas push en ESTE dispositivo (teléfono o navegador). */
export default function PushActivar() {
  const [estado, setEstado] = useState<Estado>('cargando');
  const [clave, setClave] = useState('');
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  const revisar = useCallback(async () => {
    try {
      const esIos = /iPhone|iPad|iPod/i.test(navigator.userAgent);
      const instalada = window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        return setEstado(esIos && !instalada ? 'ios-instalar' : 'no-soportado');
      }
      const cfg = await pushService.config();
      if (!cfg.habilitado) return setEstado('deshabilitado');
      setClave(cfg.publicKey);
      if (Notification.permission === 'denied') return setEstado('denegado');
      const reg = await navigator.serviceWorker.getRegistration('/sw.js');
      const sub = await reg?.pushManager.getSubscription();
      setEstado(sub && Notification.permission === 'granted' ? 'activo' : 'inactivo');
    } catch (err) {
      setError(errorMessage(err));
      setEstado('no-soportado');
    }
  }, []);

  useEffect(() => {
    revisar();
  }, [revisar]);

  async function activar() {
    setError('');
    setAviso('');
    setTrabajando(true);
    try {
      const permiso = await Notification.requestPermission();
      if (permiso !== 'granted') {
        setEstado(permiso === 'denied' ? 'denegado' : 'inactivo');
        return;
      }
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: aUint8(clave) }));
      const j = sub.toJSON();
      await pushService.suscribir({ endpoint: sub.endpoint, keys: { p256dh: j.keys!.p256dh, auth: j.keys!.auth }, userAgent: navigator.userAgent });
      setEstado('activo');
      await pushService.probar().catch(() => undefined);
      setAviso('¡Listo! Te enviamos una notificación de prueba.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setTrabajando(false);
    }
  }

  async function desactivar() {
    setError('');
    setAviso('');
    setTrabajando(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js');
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await pushService.quitar(sub.endpoint).catch(() => undefined);
        await sub.unsubscribe();
      }
      setEstado('inactivo');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setTrabajando(false);
    }
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Alertas en tu teléfono</h2>
          <p className="mt-1 text-sm text-muted">Recibe una notificación al instante cuando haya movimientos, pagos, cambios en tus gestiones o bloqueos de tarjeta, aunque no tengas la página abierta.</p>
        </div>
        {estado === 'activo' && <span className="shrink-0 rounded-full bg-verde-bg px-2.5 py-1 text-xs font-bold text-verde">Activas</span>}
      </div>

      {error && <Alert tone="error">{error}</Alert>}
      {aviso && <Alert tone="success">{aviso}</Alert>}

      {estado === 'ios-instalar' && (
        <Alert tone="info">
          En iPhone/iPad primero instala la app: abre esta página en <strong>Safari</strong>, toca <strong>Compartir</strong> → <strong>Añadir a pantalla de inicio</strong>, ábrela desde ese ícono y vuelve aquí para activar las alertas (requiere iOS 16.4 o superior).
        </Alert>
      )}
      {estado === 'no-soportado' && <Alert tone="info">Este navegador no admite notificaciones push. Prueba con Chrome, Edge, Firefox o Safari actualizado.</Alert>}
      {estado === 'deshabilitado' && <Alert tone="info">Las alertas push todavía no están habilitadas en el servidor del banco.</Alert>}
      {estado === 'denegado' && <Alert tone="error">Bloqueaste las notificaciones de este sitio. Actívalas en los permisos del navegador (candado junto a la dirección) y recarga la página.</Alert>}

      {estado === 'inactivo' && (
        <Button onClick={activar} loading={trabajando}>
          Activar alertas en este dispositivo
        </Button>
      )}
      {estado === 'activo' && (
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => pushService.probar().then(() => setAviso('Enviamos una notificación de prueba.')).catch((e) => setError(errorMessage(e)))}>
            Enviar prueba
          </Button>
          <Button variant="danger" onClick={desactivar} loading={trabajando}>
            Desactivar en este dispositivo
          </Button>
        </div>
      )}
    </Card>
  );
}
