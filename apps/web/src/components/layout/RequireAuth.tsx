import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAuth } from '../../lib/auth-context';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'restoring') {
    return (
      <p role="status" className="mx-auto max-w-7xl px-4 py-16 font-mono text-sm text-ink-3 sm:px-6">
        Restoring your session…
      </p>
    );
  }
  if (status === 'signed-out') {
    return (
      <Navigate to={`/sign-in?next=${encodeURIComponent(location.pathname + location.search)}`} replace />
    );
  }
  return children;
}
