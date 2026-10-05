import { useId } from 'react';
import type { InputHTMLAttributes, SelectHTMLAttributes } from 'react';

const BASE =
  'mt-1.5 block min-h-11 w-full rounded-[10px] border bg-input px-3.5 py-2.5 text-ink placeholder:text-[#5c688c] transition focus:border-brand-500 focus:bg-input-focus focus:outline-none focus:ring-[3px] focus:ring-brand-600/20';

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
}

export function Field({ label, hint, error, className = '', ...rest }: FieldProps) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold text-ink">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={!!error}
        aria-describedby={error || hint ? `${id}-d` : undefined}
        {...rest}
        className={`${BASE} ${error ? 'border-rojo' : 'border-line'} ${className}`}
      />
      {(error || hint) && (
        <p id={`${id}-d`} className={`mt-1 text-xs ${error ? 'text-rojo' : 'text-muted'}`}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: { value: string; label: string }[];
}

export function SelectField({ label, options, className = '', ...rest }: SelectFieldProps) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold text-ink">
        {label}
      </label>
      <select id={id} {...rest} className={`${BASE} border-line ${className}`}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
