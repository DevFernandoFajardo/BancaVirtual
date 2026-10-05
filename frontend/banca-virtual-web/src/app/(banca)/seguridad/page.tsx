'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { PageLoader } from '@/components/ui/Spinner';
import type { Sesion } from '@/interfaces/banca.interface';
import { errorMessage } from '@/lib/api';
import { formatRelativo } from '@/lib/format';
import { seguridadService } from '@/services/banca.service';

const REGLA = /^(?=.*[A-Za-z])(?=.*\d).{8,72}$/;

export default function SeguridadPage() {
  const [dosFactores, setDosFactores] = useState<boolean | null>(null);
  const [sesiones, setSesiones] = useState<Sesion[]>([]);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    try {
      const [e, s] = await Promise.all([seguridadService.estado(), seguridadService.sesiones()]);
      setDosFactores(e.dosFactoresActivo);
      setSesiones(s);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  if (dosFactores === null && !error) return <PageLoader />;

  return (
    <div className="space-y-6">
      {error && <Alert tone="error">{error}</Alert>}
      <CambiarPassword onCambio={cargar} />
      <DosFactores activo={!!dosFactores} onCambio={cargar} />
      <Sesiones sesiones={sesiones} onCambio={cargar} onError={setError} />
    </div>
  );
}

function CambiarPassword({ onCambio }: { onCambio: () => Promise<void> }) {
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetir, setRepetir] = useState('');
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [guardando, setGuardando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError('');
    setOk('');
    setGuardando(true);
    try {
      await seguridadService.cambiarPassword(actual, nueva);
      setActual('');
      setNueva('');
      setRepetir('');
      setOk('Contraseña actualizada. Cerramos tus otras sesiones por seguridad.');
      await onCambio();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Card>
      <h2 className="text-lg font-semibold">Cambiar contraseña</h2>
      <p className="mt-1 text-sm text-muted">Usa al menos 8 caracteres, con letras y números.</p>
      <form onSubmit={enviar} className="mt-4 space-y-4" noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        {ok && <Alert tone="success">{ok}</Alert>}
        <Field label="Contraseña actual" type="password" autoComplete="current-password" value={actual} onChange={(e) => setActual(e.target.value)} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Contraseña nueva"
            type="password"
            autoComplete="new-password"
            value={nueva}
            onChange={(e) => setNueva(e.target.value)}
            error={nueva && !REGLA.test(nueva) ? 'Mínimo 8 caracteres, con letras y números' : undefined}
          />
          <Field
            label="Repite la contraseña nueva"
            type="password"
            autoComplete="new-password"
            value={repetir}
            onChange={(e) => setRepetir(e.target.value)}
            error={repetir && repetir !== nueva ? 'No coincide' : undefined}
          />
        </div>
        <Button type="submit" loading={guardando} disabled={!actual || !REGLA.test(nueva) || nueva !== repetir}>
          Actualizar contraseña
        </Button>
      </form>
    </Card>
  );
}

function DosFactores({ activo, onCambio }: { activo: boolean; onCambio: () => Promise<void> }) {
  const [fase, setFase] = useState<'inicio' | 'configurando' | 'desactivando'>('inicio');
  const [secreto, setSecreto] = useState('');
  const [qr, setQr] = useState('');
  const [codigo, setCodigo] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [trabajando, setTrabajando] = useState(false);

  async function iniciar() {
    setError('');
    setOk('');
    setTrabajando(true);
    try {
      const r = await seguridadService.iniciar2fa();
      setSecreto(r.secreto);
      const QRCode = (await import('qrcode')).default;
      setQr(await QRCode.toDataURL(r.otpauthUrl, { width: 220, margin: 1, color: { dark: '#0d1425', light: '#ffffff' } }));
      setCodigo('');
      setFase('configurando');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setTrabajando(false);
    }
  }

  async function activar(e: FormEvent) {
    e.preventDefault();
    setError('');
    setTrabajando(true);
    try {
      await seguridadService.activar2fa(codigo);
      setFase('inicio');
      setOk('¡Verificación en dos pasos activada! Desde ahora te pediremos un código al iniciar sesión.');
      await onCambio();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setTrabajando(false);
    }
  }

  async function desactivar(e: FormEvent) {
    e.preventDefault();
    setError('');
    setTrabajando(true);
    try {
      await seguridadService.desactivar2fa(password, codigo);
      setFase('inicio');
      setPassword('');
      setCodigo('');
      setOk('Verificación en dos pasos desactivada.');
      await onCambio();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setTrabajando(false);
    }
  }

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Verificación en dos pasos</h2>
          <p className="mt-1 text-sm text-muted">
            Además de tu contraseña, te pedimos un código de 6 dígitos que genera una app como Google Authenticator, Microsoft Authenticator o Authy.
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${activo ? 'bg-verde-bg text-verde' : 'bg-amarillo-bg text-amarillo'}`}>
          {activo ? 'Activada' : 'Desactivada'}
        </span>
      </div>

      {error && <Alert tone="error">{error}</Alert>}
      {ok && <Alert tone="success">{ok}</Alert>}

      {fase === 'inicio' &&
        (activo ? (
          <Button variant="danger" onClick={() => { setFase('desactivando'); setError(''); setOk(''); }}>
            Desactivar
          </Button>
        ) : (
          <Button onClick={iniciar} loading={trabajando}>
            Activar verificación en dos pasos
          </Button>
        ))}

      {fase === 'configurando' && (
        <form onSubmit={activar} className="space-y-4">
          <ol className="list-decimal space-y-1.5 pl-5 text-sm">
            <li>Abre tu app de autenticación y agrega una cuenta nueva.</li>
            <li>Escanea este código QR (o escribe la clave manualmente).</li>
            <li>Ingresa el código de 6 dígitos que te muestre la app.</li>
          </ol>
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {qr && <img src={qr} alt="Código QR para configurar la verificación en dos pasos" width={180} height={180} className="rounded-xl border border-line bg-white p-2" />}
            <div className="min-w-0">
              <p className="text-xs text-muted">Clave manual</p>
              <p className="tabular break-all rounded-lg border border-line bg-input px-3 py-2 font-mono text-sm tracking-wider">{secreto.match(/.{1,4}/g)?.join(' ')}</p>
            </div>
          </div>
          <Field label="Código de la app" inputMode="numeric" maxLength={6} value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))} placeholder="000000" className="max-w-[220px] text-center text-lg tracking-[0.3em]" />
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => setFase('inicio')}>
              Cancelar
            </Button>
            <Button type="submit" loading={trabajando} disabled={codigo.length !== 6}>
              Confirmar y activar
            </Button>
          </div>
        </form>
      )}

      {fase === 'desactivando' && (
        <form onSubmit={desactivar} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tu contraseña" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <Field label="Código de la app" inputMode="numeric" maxLength={6} value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))} placeholder="000000" />
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => setFase('inicio')}>
              Cancelar
            </Button>
            <Button type="submit" variant="danger" loading={trabajando} disabled={!password || codigo.length !== 6}>
              Desactivar
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}

function Sesiones({ sesiones, onCambio, onError }: { sesiones: Sesion[]; onCambio: () => Promise<void>; onError: (m: string) => void }) {
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const otras = sesiones.filter((s) => !s.actual);

  async function cerrar(id: string) {
    onError('');
    setTrabajando(id);
    try {
      await seguridadService.cerrarSesion(id);
      await onCambio();
    } catch (err) {
      onError(errorMessage(err));
    } finally {
      setTrabajando(null);
    }
  }

  async function cerrarOtras() {
    onError('');
    setTrabajando('todas');
    try {
      await seguridadService.cerrarOtras();
      await onCambio();
    } catch (err) {
      onError(errorMessage(err));
    } finally {
      setTrabajando(null);
    }
  }

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Sesiones activas</h2>
          <p className="mt-1 text-sm text-muted">Dispositivos con tu sesión abierta. Cierra los que no reconozcas.</p>
        </div>
        {otras.length > 0 && (
          <Button variant="danger" loading={trabajando === 'todas'} onClick={cerrarOtras}>
            Cerrar las demás
          </Button>
        )}
      </div>
      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
        {sesiones.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-4 bg-input/40 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                {s.dispositivo}
                {s.actual && <span className="ml-2 rounded-full bg-verde-bg px-2 py-0.5 text-xs font-semibold text-verde">Esta sesión</span>}
              </p>
              <p className="truncate text-xs text-muted">
                {s.ip ? `IP ${s.ip} · ` : ''}Inició {formatRelativo(s.createdAt)} · actividad {formatRelativo(s.lastSeenAt)}
              </p>
            </div>
            {!s.actual && (
              <button disabled={trabajando === s.id} onClick={() => cerrar(s.id)} className="shrink-0 text-xs font-semibold text-rojo hover:underline disabled:opacity-50">
                Cerrar
              </button>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
