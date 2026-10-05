'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field, SelectField } from '@/components/ui/Field';
import { PageLoader } from '@/components/ui/Spinner';
import type { Cliente } from '@/interfaces/auth.interface';
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
