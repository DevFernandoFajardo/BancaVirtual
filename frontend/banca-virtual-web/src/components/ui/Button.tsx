import type { ButtonHTMLAttributes } from 'react';
import { Spinner } from './Spinner';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-accent-dark disabled:bg-brand-600/50',
  secondary: 'bg-input text-ink border border-line hover:border-muted disabled:opacity-50',
  danger: 'bg-input text-rojo border border-rojo/25 hover:bg-rojo-bg disabled:opacity-50',
  ghost: 'text-brand-700 hover:bg-brand-50 disabled:opacity-50',
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
  full?: boolean;
}

export function Button({ variant = 'primary', loading = false, full = false, className = '', children, disabled, ...rest }: Props) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] px-5 py-2.5 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed ${VARIANTS[variant]} ${full ? 'w-full' : ''} ${className}`}
    >
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
}
