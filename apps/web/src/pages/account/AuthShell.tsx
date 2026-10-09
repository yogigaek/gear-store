import type { ReactNode } from 'react';
import { Label } from '../../components/ui/Label';

export function AuthShell({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-16">
      <div className="max-w-md space-y-6">
        <div className="space-y-2">
          <Label>{eyebrow}</Label>
          <h1 className="font-expanded text-3xl font-extrabold uppercase">{title}</h1>
        </div>
        {children}
      </div>
    </div>
  );
}
