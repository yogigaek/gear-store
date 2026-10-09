import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost';

const styles: Record<Variant, string> = {
  // the one place signal yellow appears at rest: under the main action
  primary:
    'bg-ink text-alu-50 border-b-[3px] border-signal hover:bg-ink-2 disabled:bg-bench-strong disabled:border-bench',
  secondary:
    'border border-ink text-ink hover:bg-ink hover:text-alu-50 disabled:border-bench disabled:text-ink-3',
  ghost: 'text-ink underline underline-offset-4 decoration-bench-strong hover:decoration-ink',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: ReactNode;
}

export function Button({ variant = 'primary', className = '', type = 'button', ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex min-h-11 items-center justify-center gap-2 px-5 text-sm font-semibold uppercase tracking-[0.06em] transition-colors disabled:cursor-not-allowed ${styles[variant]} ${className}`}
      {...props}
    />
  );
}
