import type { Semaforo } from '@/interfaces/solicitud.interface';

const STYLES: Record<string, { box: string; dot: string; text: string }> = {
  VERDE: { box: 'bg-verde-bg text-verde border-verde/25', dot: 'bg-verde', text: 'Cumple' },
  AMARILLO: { box: 'bg-amarillo-bg text-amarillo border-amarillo/25', dot: 'bg-amarillo', text: 'Revisión' },
  ROJO: { box: 'bg-rojo-bg text-rojo border-rojo/25', dot: 'bg-rojo', text: 'No cumple' },
};

/** El texto acompaña al color para que no dependa solo de él (accesibilidad). */
export function SemaforoBadge({ valor }: { valor: Semaforo }) {
  const s = STYLES[valor] ?? { box: 'bg-canvas text-muted border-line', dot: 'bg-muted', text: valor };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${s.box}`}>
      <span className={`h-2 w-2 rounded-full ${s.dot}`} aria-hidden="true" />
      {s.text}
    </span>
  );
}
