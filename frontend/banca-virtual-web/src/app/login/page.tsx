'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { errorMessage } from '@/lib/api';
import { authService } from '@/services/auth/auth.service';

function LoginForm() {
  const router = useRouter();
  const expirada = useSearchParams().get('expirada') === '1';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [desafio, setDesafio] = useState<string | null>(null);
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function entrar(cliente: { rol: string }) {
    if (cliente.rol !== 'CLIENTE') {
      // Los administradores usan la app administrativa, no la banca de clientes
      await authService.logout();
      setError('Esta cuenta es administrativa. Ingresa desde la aplicación de administración.');
      setDesafio(null);
      return;
    }
    router.replace('/dashboard');
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (desafio) {
        const res = await authService.verificarDosFactores(desafio, codigo.trim());
        await entrar(res.cliente);
        return;
      }
      const res = await authService.login({ email: email.trim(), password });
      if ('requiere2fa' in res) {
        setDesafio(res.desafio);
        setCodigo('');
      } else {
        await entrar(res.cliente);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-[420px] rounded-[20px] border border-line bg-card px-[26px] py-8 shadow-card sm:px-10 sm:py-[42px]">
      <p className="text-[.78rem] font-extrabold uppercase tracking-[0.08em] text-brand-600">Acceso a la banca</p>
      <h2 className="mt-[7px] text-[1.25rem] font-bold">{desafio ? 'Verificación en dos pasos' : 'Bienvenido de nuevo'}</h2>
      <p className="mb-6 text-muted">
        {desafio ? 'Abre tu app de autenticación e ingresa el código de 6 dígitos.' : 'Ingresa tus credenciales para continuar'}
      </p>

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {expirada && !desafio && <Alert tone="info">Tu sesión venció. Ingresa de nuevo.</Alert>}
        {error && <Alert tone="error">{error}</Alert>}
        {desafio ? (
          <>
            <Field
              label="Código de verificación"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              autoFocus
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              className="text-center text-xl tracking-[0.4em]"
            />
            <Button type="submit" full loading={loading} disabled={codigo.length !== 6}>
              Verificar y entrar
            </Button>
            <button type="button" onClick={() => { setDesafio(null); setError(''); }} className="w-full text-center text-sm text-muted hover:text-ink">
              ← Volver
            </button>
          </>
        ) : (
          <>
            <Field label="Correo electrónico" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            <Field label="Contraseña" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            <Button type="submit" full loading={loading} disabled={!email || !password}>
              Ingresar
            </Button>
          </>
        )}
      </form>

      <p className="mt-5 text-center text-[.82rem] text-muted">
        ¿Aún no tienes cuenta?{' '}
        <Link href="/registro" className="font-semibold text-brand-600 hover:underline">
          Regístrate
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="grid min-h-dvh bg-navy-900 lg:grid-cols-[1.1fr_1fr]">
      <section className="relative flex flex-col overflow-hidden bg-[radial-gradient(circle_at_15%_10%,#14213f,#0a1224_55%,#070d1a)] px-[30px] py-9 text-[#dfe6f5] lg:px-[64px] lg:py-12">
        {/* Círculos decorativos */}
        <div aria-hidden className="pointer-events-none absolute -right-[22%] top-[18%] h-[120%] w-[90%] rounded-full border border-white/[0.04] bg-white/[0.015]" />
        <div aria-hidden className="pointer-events-none absolute -right-[8%] top-[34%] h-[95%] w-[70%] rounded-full border border-white/[0.04] bg-black/[0.12]" />

        <div className="relative flex items-center gap-3">
          <img src="/logo.svg" alt="CP BancaVirtual" width={44} height={44} className="h-11 w-11 rounded-xl shadow-[0_6px_18px_-6px_rgba(63,149,204,0.7)]" />
          <div>
            <p className="text-[1.02rem] font-extrabold uppercase leading-tight tracking-wide text-white">CP BancaVirtual</p>
            <p className="text-[.62rem] uppercase tracking-[0.28em] text-[#7f8fb4]">Banca en línea</p>
          </div>
        </div>

        <div className="relative my-auto py-12 lg:py-16">
          <p className="mb-6 flex items-center gap-2.5 text-[.68rem] font-bold uppercase tracking-[0.26em] text-[#5fb7e0]">
            <span className="h-1.5 w-1.5 rounded-full bg-verde" />
            Tu dinero, siempre a la mano
          </p>
          <h1 className="text-[2.6rem] font-light leading-[1.05] tracking-tight text-[#e9eefb] sm:text-[3.2rem] lg:text-[4rem]">
            Fácil de usar.
            <br />
            Rápida y segura.
            <br />
            <span className="bg-gradient-to-r from-[#6f9bff] via-[#5fb7e0] to-[#7ee0c3] bg-clip-text font-normal text-transparent">Todo en un toque.</span>
          </h1>
          <p className="mt-7 max-w-[470px] text-[1.02rem] leading-relaxed text-[#8f9dc0]">
            Consulta tus cuentas, transfiere en segundos, paga tus servicios y solicita tarjetas y préstamos desde cualquier lugar. Todo
            protegido, sin filas y sin complicaciones.
          </p>
        </div>

        <div className="relative grid grid-cols-3 items-start gap-4">
          {[
            ['M3 7h18M3 12h18M3 17h12', 'Transferencias', 'Al instante, 24/7'],
            ['M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6l8-3zM9 12l2.2 2.2L15.5 10', 'Seguridad', 'Protección en cada paso'],
            ['M5 13l4 4L19 7', 'Solicitudes', 'Resultado claro y rápido'],
          ].map(([d, t, sub]) => (
            <div key={t} className="min-w-0">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#7fb4e6" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d={d} />
              </svg>
              <div className="mt-3 h-px w-full bg-gradient-to-r from-[#5fb7e0]/50 to-transparent" />
              <p className="mt-2.5 text-[.8rem] font-semibold text-white">{t}</p>
              <p className="text-[.68rem] leading-snug text-[#6f7fa6]">{sub}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="flex items-center justify-center bg-canvas p-6 sm:p-10">
        <Suspense>
          <LoginForm />
        </Suspense>
      </section>
    </div>
  );
}
