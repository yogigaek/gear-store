import type { ReactNode } from 'react';
import { Label } from '../../components/ui/Label';
import { PageTitle } from '../../components/ui/PageTitle';

/**
 * What an account page puts in the panel of `AuthLayout`: its heading, an optional `lead` set off by
 * "or with email" (a quicker way in, such as the demo accounts), and the form.
 */
export function AuthShell({
  eyebrow,
  title,
  intro,
  lead,
  children,
}: {
  eyebrow: string;
  title: string;
  intro?: ReactNode;
  lead?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <PageTitle>{title}</PageTitle>
      <header className="space-y-2">
        <Label>{eyebrow}</Label>
        <h1 className="font-expanded text-3xl font-extrabold uppercase leading-none">{title}</h1>
        {intro && <p className="pt-1 text-sm text-ink-2">{intro}</p>}
      </header>
      {lead && (
        <>
          <div className="mt-6 lg:mt-5">{lead}</div>
          <p
            aria-hidden="true"
            className="my-6 flex items-center gap-3 lg:my-4 font-mono text-[0.7rem] uppercase tracking-[0.08em] text-ink-3 before:h-px before:flex-1 before:bg-bench after:h-px after:flex-1 after:bg-bench"
          >
            or with email
          </p>
        </>
      )}
      <div className={`space-y-5 lg:space-y-4 ${lead ? '' : 'mt-6 lg:mt-5'}`}>{children}</div>
    </>
  );
}
