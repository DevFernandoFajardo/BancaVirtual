import type { PoliticaEvaluada } from '@/interfaces/solicitud.interface';
import { SemaforoBadge } from './SemaforoBadge';

/** Detalle de cada política que evaluó el motor (CORE): qué se revisó y por qué. */
export function PoliticasList({ politicas }: { politicas: PoliticaEvaluada[] }) {
  return (
    <ul className="divide-y divide-line rounded-xl border border-line">
      {politicas.map((p, i) => (
        <li key={`${p.nombre}-${i}`} className="flex items-start justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">{p.nombre}</p>
            <p className="mt-0.5 text-xs text-muted">{p.detalle}</p>
          </div>
          <SemaforoBadge valor={p.resultado} />
        </li>
      ))}
    </ul>
  );
}
