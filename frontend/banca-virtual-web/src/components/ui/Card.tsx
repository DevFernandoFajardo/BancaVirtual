import type { HTMLAttributes } from 'react';

export function Card({ className = '', ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} className={`rounded-2xl border border-line bg-card p-6 shadow-card ${className}`} />;
}
