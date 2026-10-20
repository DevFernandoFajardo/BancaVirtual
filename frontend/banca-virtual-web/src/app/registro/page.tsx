'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { errorMessage } from '@/lib/api';
import { authService } from '@/services/auth/auth.service';

export default function RegistroPage() {
  const router = useRouter();
  const [f, setF] = useState({
    primerNombre: '',
    primerApellido: '',
    email: '',
    password: '',
    dpi: '',
    fechaNacimiento: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));

  const dpiOk = /^\d{13}$/.test(f.dpi);
  const passOk = f.password.length >= 8;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await authService.register({
        email: f.email.trim(),
        password: f.password,
        primerNombre: f.primerNombre.trim(),
        primerApellido: f.primerApellido.trim(),
        dpi: f.dpi,
        fechaNacimiento: f.fechaNacimiento,
      });
      router.replace('/dashboard');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-dvh place-items-center px-4 py-10">
      <Card className="w-full max-w-xl rounded-[20px] p-6 sm:px-10 sm:py-[42px]">
        <div className="mb-5 flex items-center gap-[11px]">
          <span className="grid h-[38px] w-[38px] place-items-center rounded-[10px] bg-brand-600 text-[.9rem] font-extrabold text-white shadow-[0_4px_14px_-4px_rgba(91,141,255,0.6)]">BV</span>
          <span className="text-[1.15rem] font-extrabold tracking-tight">BancaVirtual</span>
        </div>
        <p className="text-[.78rem] font-extrabold uppercase tracking-[0.08em] text-brand-600">Registro</p>
        <h1 className="mt-[7px] text-[1.25rem] font-bold">Crea tu cuenta</h1>
        <p className="mt-1 text-sm text-muted">
          Al registrarte abrimos tu primera cuenta de ahorro. Los datos de empleo e ingresos te los pediremos cuando solicites un producto.
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
          {error && <Alert tone="error">{error}</Alert>}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombre" required autoComplete="given-name" value={f.primerNombre} onChange={set('primerNombre')} />
            <Field label="Apellido" required autoComplete="family-name" value={f.primerApellido} onChange={set('primerApellido')} />
          </div>
          <Field label="Correo electrónico" type="email" required autoComplete="email" value={f.email} onChange={set('email')} />
          <Field
            label="Contraseña"
            type="password"
            required
            autoComplete="new-password"
            value={f.password}
            onChange={set('password')}
            hint="Mínimo 8 caracteres"
            error={f.password && !passOk ? 'Debe tener al menos 8 caracteres' : undefined}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="DPI"
              inputMode="numeric"
              maxLength={13}
              required
              value={f.dpi}
              onChange={(e) => setF((p) => ({ ...p, dpi: e.target.value.replace(/\D/g, '') }))}
              hint="13 dígitos"
              error={f.dpi && !dpiOk ? 'El DPI debe tener 13 dígitos' : undefined}
            />
            <Field label="Fecha de nacimiento" type="date" required value={f.fechaNacimiento} onChange={set('fechaNacimiento')} max={new Date().toISOString().slice(0, 10)} />
          </div>

          <Button
            type="submit"
            full
            loading={loading}
            disabled={!f.primerNombre || !f.primerApellido || !f.email || !passOk || !dpiOk || !f.fechaNacimiento}
          >
            Crear cuenta
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted">
          ¿Ya tienes cuenta?{' '}
          <Link href="/login" className="font-semibold text-brand-700 hover:underline">
            Ingresa
          </Link>
        </p>
      </Card>
    </div>
  );
}
