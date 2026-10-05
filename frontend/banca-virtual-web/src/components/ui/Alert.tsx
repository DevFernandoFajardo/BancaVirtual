import type { ReactNode } from 'react';

type Tone = 'error' | 'success' | 'info';

const TONES: Record<Tone, string> = {
  error: 'border-rojo/25 bg-rojo-bg text-rojo',
  success: 'border-verde/25 bg-verde-bg text-verde',
  info: 'border-brand-600/25 bg-brand-50 text-brand-600',
};

export function Alert({ tone = 'info', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-[11px] border px-4 py-3 text-sm ${TONES[tone]}`}>
      {children}
    </div>
  );
}
