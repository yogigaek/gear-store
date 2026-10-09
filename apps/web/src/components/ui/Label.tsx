import type { ReactNode } from 'react';

/** Mono uppercase caption: model numbers, section labels, units. */
export function Label({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span className={`font-mono text-[0.72rem] uppercase tracking-[0.08em] text-ink-3 ${className}`}>
      {children}
    </span>
  );
}
