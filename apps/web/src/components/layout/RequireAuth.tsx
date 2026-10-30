import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAuth } from '../../lib/auth-context';
import { signInPath } from '../../lib/navigation';
import { PageTitle } from '../ui/PageTitle';
import { SlowServerNote } from '../ui/SlowServerNote';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'restoring') {
    return (
      <div className="mx-auto max-w-7xl space-y-2 px-4 py-16 sm:px-6">
        <PageTitle>Restoring your session</PageTitle>
        <p role="status" className="font-mono text-sm text-ink-3">
          Restoring your session…
        </p>
        <SlowServerNote />
      </div>
    );
  }
  if (status === 'signed-out') {
    return <Navigate to={signInPath(location.pathname + location.search)} replace />;
  }
  return children;
}
