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
      <section className="flex flex-col justify-center bg-[radial-gradient(circle_at_20%_20%,#16234a,#060a13_60%)] px-[30px] py-11 text-[#dfe6f5] lg:px-[58px] lg:py-[68px]">
        <div className="flex items-center gap-[11px]">
          <span className="grid h-[38px] w-[38px] place-items-center rounded-[10px] bg-brand-600 text-[.9rem] font-extrabold text-white shadow-[0_4px_14px_-4px_rgba(91,141,255,0.6)]">
            BV
          </span>
          <span className="text-[1.15rem] font-extrabold tracking-tight text-white">BancaVirtual</span>
        </div>
        <h1 className="my-[30px] mb-4 text-[1.9rem] font-bold leading-tight text-white lg:text-[2.5rem]">
          Tu banca, clara y segura,
          <br />
          en un solo lugar.
        </h1>
        <p className="max-w-[460px] text-[#aab6d1]">
          Consulta tus cuentas, simula transferencias y solicita tarjetas y créditos. Cada solicitud se evalúa con el motor
          CreditPulse y recibes un resultado claro: aprobada o no aprobada.
        </p>
        <div className="mt-[38px] hidden max-w-[360px] rounded-[15px] border border-white/[0.12] bg-white/[0.06] px-[22px] py-5 backdrop-blur-sm sm:block">
          <p className="text-[.78rem] uppercase tracking-[0.06em] text-[#93a1c4]">Resultado de ejemplo</p>
          <div className="mt-[11px] flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-verde-bg px-3 py-[5px] text-[.82rem] font-bold text-verde">Aprobada</span>
            <span className="text-[.9rem]">Tarjeta de Crédito</span>
          </div>
          <div className="mt-[15px] h-[7px] overflow-hidden rounded-full bg-white/[0.12]">
            <div className="h-full w-4/5 rounded-full bg-verde" />
          </div>
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
