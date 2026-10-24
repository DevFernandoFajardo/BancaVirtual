'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field, SelectField } from '@/components/ui/Field';
import { PageLoader } from '@/components/ui/Spinner';
import type { Cliente } from '@/interfaces/auth.interface';
import type { Cuenta } from '@/interfaces/cuenta.interface';
import { TIPO_CUENTA_LABEL, formatCuenta } from '@/lib/format';
import { cuentasService } from '@/services/cuentas/cuentas.service';
import { errorMessage } from '@/lib/api';
import { formatDay } from '@/lib/format';
import { perfilService } from '@/services/perfil/perfil.service';

export default function PerfilPage() {
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [ingresos, setIngresos] = useState('');
  const [empleo, setEmpleo] = useState('Asalariado');
  const [antiguedad, setAntiguedad] = useState('');
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [celular, setCelular] = useState('');
  const [cuentaCel, setCuentaCel] = useState('');
  const [celGuardado, setCelGuardado] = useState<string | null>(null);
  const [celOk, setCelOk] = useState('');
  const [celError, setCelError] = useState('');
  const [celGuardando, setCelGuardando] = useState(false);

  useEffect(() => {
    Promise.all([cuentasService.listar(), perfilService.celular()])
      .then(([c, cel]) => {
        const aptas = c.filter((x) => x.estado === 'ACTIVA' && x.tipo !== 'PLAZO_FIJO');
        setCuentas(aptas);
        setCelular(cel.telefono ?? '');
        setCelGuardado(cel.telefono);
        setCuentaCel(cel.cuentaId ?? '');
      })
      .catch(() => undefined);
  }, []);

  async function guardarCelular(telefono: string | null) {
    setCelError('');
    setCelOk('');
    setCelGuardando(true);
    try {
      const r = await perfilService.guardarCelular(telefono, telefono ? cuentaCel || undefined : undefined);
      setCelGuardado(r.telefono);
      if (!r.telefono) setCelular('');
      setCelOk(r.telefono ? 'Listo: ya pueden enviarte dinero a ese celular.' : 'Quitaste tu celular. Ya no pueden transferirte por número.');
    } catch (err) {
      setCelError(errorMessage(err));
    } finally {
      setCelGuardando(false);
    }
  }

  useEffect(() => {
    perfilService
      .obtener()
      .then((c) => {
        setCliente(c);
        setIngresos(String(c.ingresosMensuales));
        setEmpleo(c.tipoEmpleo ?? 'Asalariado');
        setAntiguedad(String(c.antiguedadLaboralMeses));
      })
      .catch((err) => setError(errorMessage(err)));
  }, []);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError('');
    setOk('');
    setGuardando(true);
    try {
      setCliente(
        await perfilService.actualizar({
          ingresosMensuales: Number(ingresos),
          tipoEmpleo: empleo,
          antiguedadLaboralMeses: Number(antiguedad || 0),
        }),
      );
      setOk('Datos actualizados. Se usarán en tus próximas solicitudes.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setGuardando(false);
    }
  }

  if (!cliente && !error) return <PageLoader />;
  if (!cliente) return <Alert tone="error">{error}</Alert>;

  return (
    <div className="space-y-6">
      <Card>
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <Dato k="Nombre" v={`${cliente.primerNombre} ${cliente.primerApellido}`} />
          <Dato k="Correo" v={cliente.email} />
          <Dato k="DPI" v={cliente.dpi ?? '—'} />
          <Dato k="NIT" v={cliente.nit ?? '—'} />
          <Dato k="Fecha de nacimiento" v={cliente.fechaNacimiento ? formatDay(`${cliente.fechaNacimiento}T12:00:00`) : '—'} />
        </dl>
        <p className="mt-4 text-xs text-muted">Tu DPI se muestra parcialmente y se guarda cifrado.</p>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold">Mi celular para recibir transferencias</h2>
        <p className="mt-1 text-sm text-muted">Con tu número de celular, otros clientes te envían dinero sin saber tu número de cuenta. Elige la cuenta donde lo recibes.</p>
        <div className="mt-4 space-y-4">
          {celError && <Alert tone="error">{celError}</Alert>}
          {celOk && <Alert tone="success">{celOk}</Alert>}
          {cuentas.length === 0 && <p className="text-sm text-muted">Aún no tienes cuenta activa. Guarda tu celular y lo que te envíen se acreditará cuando abras tu primera cuenta.</p>}
          {(
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Celular" inputMode="numeric" maxLength={8} value={celular} onChange={(e) => setCelular(e.target.value.replace(/\D/g, ''))} placeholder="5555 1234" hint="8 dígitos" />
              <SelectField
                label="Recibir en"
                value={cuentaCel}
                onChange={(e) => setCuentaCel(e.target.value)}
                options={[{ value: '', label: 'Automática (mi cuenta más antigua)' }, ...cuentas.map((c) => ({ value: c.id, label: `${TIPO_CUENTA_LABEL[c.tipo]} · ${formatCuenta(c.numero)}` }))]}
              />
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="button" loading={celGuardando} disabled={!/^[2-7]\d{7}$/.test(celular)} onClick={() => guardarCelular(celular)}>
              Guardar celular
            </Button>
            {celGuardado && (
              <Button type="button" variant="secondary" disabled={celGuardando} onClick={() => guardarCelular(null)}>
                Quitar celular
              </Button>
            )}
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold">Datos financieros</h2>
        <p className="mt-1 text-sm text-muted">Estos datos se envían al motor de evaluación cuando solicitas un producto.</p>
        <form onSubmit={guardar} className="mt-4 space-y-4">
          {error && <Alert tone="error">{error}</Alert>}
          {ok && <Alert tone="success">{ok}</Alert>}
          <Field label="Ingresos mensuales (Q)" type="number" inputMode="decimal" min={0} step="0.01" required value={ingresos} onChange={(e) => setIngresos(e.target.value)} />
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Tipo de empleo"
              value={empleo}
              onChange={(e) => setEmpleo(e.target.value)}
              options={[
                { value: 'Asalariado', label: 'Asalariado' },
                { value: 'Independiente', label: 'Independiente' },
              ]}
            />
            <Field label="Antigüedad laboral (meses)" type="number" inputMode="numeric" min={0} value={antiguedad} onChange={(e) => setAntiguedad(e.target.value)} />
          </div>
          <Button type="submit" loading={guardando} disabled={ingresos === ''}>
            Guardar cambios
          </Button>
        </form>
      </Card>
    </div>
  );
}

function Dato({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-muted">{k}</dt>
      <dd className="mt-0.5 font-medium">{v}</dd>
    </div>
  );
}
