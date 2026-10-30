import { type InputHTMLAttributes, useId, useState } from 'react';

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
}

/** Label, input, hint and error wired together for screen readers. Inputs are 16 px so iOS does not zoom. */
export function Field({ label, error, hint, type = 'text', className = '', ...props }: FieldProps) {
  const id = useId();
  const [revealed, setRevealed] = useState(false);
  const isPassword = type === 'password';
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="font-mono text-xs uppercase tracking-[0.08em] text-ink-2">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={isPassword && revealed ? 'text' : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`min-h-11 w-full border bg-alu-50 px-3 text-base text-ink transition-colors focus:border-ink ${
            error ? 'border-danger' : 'border-field'
          } ${isPassword ? 'pr-16' : ''}`}
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setRevealed((r) => !r)}
            className="absolute inset-y-0 right-0 px-3 font-mono text-xs uppercase tracking-[0.08em] text-ink-2 hover:text-ink"
            aria-label={revealed ? 'Hide password' : 'Show password'}
          >
            {revealed ? 'Hide' : 'Show'}
          </button>
        )}
      </div>
      {hint && !error && (
        <p id={`${id}-hint`} className="text-sm text-ink-3">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** A form-level message: what went wrong, or what happened. */
export function Notice({ tone, children }: { tone: 'error' | 'ok'; children: React.ReactNode }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`border-l-[3px] bg-alu-50 px-4 py-3 text-sm ${tone === 'error' ? 'border-danger text-danger' : 'border-ok text-ok'}`}
    >
      {children}
    </div>
  );
}
