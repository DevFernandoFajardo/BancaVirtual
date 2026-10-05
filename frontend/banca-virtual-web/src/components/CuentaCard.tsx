import Link from 'next/link';
import type { Cuenta } from '@/interfaces/cuenta.interface';
import { TIPO_CUENTA_LABEL, formatCuenta, formatFecha, formatMoney } from '@/lib/format';

export function CuentaCard({ cuenta }: { cuenta: Cuenta }) {
  const activa = cuenta.estado === 'ACTIVA';
  const plazo = cuenta.tipo === 'PLAZO_FIJO';
  return (
    <Link
      href={`/cuentas/${cuenta.id}`}
      className="block rounded-2xl border border-line bg-card p-5 shadow-card transition hover:-translate-y-0.5 hover:border-brand-600 hover:shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{cuenta.alias ?? TIPO_CUENTA_LABEL[cuenta.tipo]}</p>
          <p className="mt-0.5 text-xs text-muted">
            {TIPO_CUENTA_LABEL[cuenta.tipo]} · <span className="tabular">{formatCuenta(cuenta.numero)}</span>
          </p>
        </div>
        {!activa && (
          <span className="rounded-full bg-amarillo-bg px-2 py-0.5 text-xs font-medium text-amarillo">{cuenta.estado}</span>
        )}
        {plazo && activa && (
          <span className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-600">{cuenta.tasaAnual}% anual</span>
        )}
      </div>
      <p className="mt-5 text-xs text-muted">{plazo ? 'Capital invertido' : 'Saldo disponible'}</p>
      <p className="tabular text-2xl font-bold">{formatMoney(cuenta.saldo, cuenta.moneda)}</p>
      {plazo && cuenta.fechaVencimiento && <p className="mt-1 text-xs text-muted">Vence el {formatFecha(cuenta.fechaVencimiento)}</p>}
    </Link>
  );
}
