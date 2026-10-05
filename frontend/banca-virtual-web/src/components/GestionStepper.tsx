import type { Solicitud } from '@/interfaces/solicitud.interface';
import { formatDate } from '@/lib/format';

type Estado = 'hecho' | 'actual' | 'error' | 'pendiente';

interface Paso {
  titulo: string;
  detalle?: string;
  estado: Estado;
}

/** Convierte el estado de la solicitud en los pasos del diagrama de flujo de la gestión. */
export function pasosDeGestion(s: Solicitud, restantes?: number): Paso[] {
  const enviada = formatDate(s.createdAt);
  const decision = s.decisionClienteAt ? formatDate(s.decisionClienteAt) : undefined;

  const pasos: Paso[] = [
    { titulo: 'Enviada', detalle: enviada, estado: 'hecho' },
    { titulo: 'En evaluación', estado: 'pendiente' },
    { titulo: 'Resultado', estado: 'pendiente' },
    { titulo: 'Tu decisión', estado: 'pendiente' },
    { titulo: 'En trámite', estado: 'pendiente' },
    { titulo: 'Completada', estado: 'pendiente' },
  ];
  const marcar = (hasta: number, estados: Partial<Record<number, Estado>> = {}) =>
    pasos.forEach((p, i) => {
      if (i < hasta) p.estado = 'hecho';
      if (estados[i]) p.estado = estados[i]!;
    });

  switch (s.estado) {
    case 'EN_EVALUACION':
      marcar(1, { 1: 'actual' });
      pasos[1].detalle = restantes !== undefined && restantes > 0 ? `Resultado en ${Math.floor(restantes / 60)}:${String(restantes % 60).padStart(2, '0')}` : 'Obteniendo resultado…';
      break;
    case 'PENDIENTE_DECISION_CLIENTE':
      marcar(3, { 3: 'actual' });
      pasos[2].titulo = 'Aprobada';
      pasos[3].detalle = 'Espera tu respuesta';
      break;
    case 'RECHAZADA_POR_POLITICAS':
      marcar(2, { 2: 'error' });
      pasos[2].titulo = 'No aprobada';
      break;
    case 'RECHAZADA_POR_CLIENTE':
      marcar(3, { 3: 'error' });
      pasos[2].titulo = 'Aprobada';
      pasos[3].titulo = 'Rechazaste';
      pasos[3].detalle = decision;
      break;
    case 'ACEPTADA':
      marcar(4, { 4: 'actual' });
      pasos[2].titulo = 'Aprobada';
      pasos[3].titulo = 'Aceptaste';
      pasos[3].detalle = decision;
      pasos[4].detalle = 'El banco gestiona tu producto';
      break;
    case 'EMITIDA':
      marcar(6);
      pasos[2].titulo = 'Aprobada';
      pasos[3].titulo = 'Aceptaste';
      pasos[3].detalle = decision;
      pasos[5].titulo = 'Producto emitido';
      break;
    case 'CANCELADA':
      if (s.decisionClienteAt) {
        marcar(4, { 4: 'error' });
        pasos[2].titulo = 'Aprobada';
        pasos[3].titulo = 'Aceptaste';
        pasos[4].titulo = 'Cancelada';
      } else {
        marcar(2, { 2: 'error' });
        pasos[2].titulo = 'Cancelada';
      }
      break;
  }
  return pasos;
}

const COLORES: Record<Estado, { circulo: string; linea: string; texto: string }> = {
  hecho: { circulo: 'border-verde bg-verde text-navy-900', linea: 'bg-verde', texto: 'text-ink' },
  actual: { circulo: 'border-brand-600 bg-[#1c2a52] text-brand-600 ring-4 ring-brand-600/20', linea: 'bg-line', texto: 'text-ink' },
  error: { circulo: 'border-rojo bg-[#3a2230] text-rojo', linea: 'bg-line', texto: 'text-rojo' },
  pendiente: { circulo: 'border-line bg-input text-muted', linea: 'bg-line', texto: 'text-muted' },
};

function Icono({ estado, n }: { estado: Estado; n: number }) {
  if (estado === 'hecho')
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m5 12.5 4.5 4.5L19 7.5" />
      </svg>
    );
  if (estado === 'error')
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
        <path d="m7 7 10 10M17 7 7 17" />
      </svg>
    );
  return <span className="text-xs font-bold">{n}</span>;
}

/** Diagrama de flujo horizontal: círculos unidos por líneas; en pantallas angostas se desplaza de lado. */
export function GestionStepper({ pasos }: { pasos: Paso[] }) {
  return (
    <div className="overflow-x-auto pb-1">
      <ol className="flex min-w-[640px] items-start">
        {pasos.map((p, i) => {
          const c = COLORES[p.estado];
          const ultimo = i === pasos.length - 1;
          return (
            <li key={`${p.titulo}-${i}`} className="relative flex flex-1 flex-col items-center text-center" aria-current={p.estado === 'actual' ? 'step' : undefined}>
              {!ultimo && (
                <span
                  className={`absolute left-1/2 top-[15px] h-[3px] w-full rounded ${p.estado === 'hecho' ? 'bg-verde' : 'bg-line'}`}
                  aria-hidden="true"
                />
              )}
              <span className={`relative z-10 grid h-8 w-8 place-items-center rounded-full border-2 ${c.circulo}`}>
                <Icono estado={p.estado} n={i + 1} />
              </span>
              <span className={`mt-2 px-1 text-[.82rem] font-semibold ${c.texto}`}>{p.titulo}</span>
              {p.detalle && <span className="mt-0.5 px-1 text-[.72rem] leading-tight text-muted">{p.detalle}</span>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
