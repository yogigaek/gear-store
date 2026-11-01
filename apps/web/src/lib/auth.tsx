import type { User } from '@gear-store/shared';
import { useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { AuthContext, type AuthValue, type Status } from './auth-context';
import { createSession, hasHint } from './session';

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Status>(() => (hasHint() ? 'restoring' : 'signed-out'));
  const [user, setUser] = useState<User | null>(null);
  const [session] = useState(() =>
    createSession({
      signedIn: (next) => {
        setUser(next);
        setStatus('signed-in');
      },
      signedOut: () => {
        setUser(null);
        setStatus('signed-out');
        queryClient.removeQueries({ queryKey: ['me'] });
      },
      unreachable: () => setStatus((s) => (s === 'restoring' ? 'signed-out' : s)),
    }),
  );

  useEffect(() => session.start(), [session]);

  const value = useMemo<AuthValue>(
    () => ({
      status,
      user,
      authed: session.authed,
      setUser,
      signIn: session.signIn,
      signInDemo: session.signInDemo,
      signOut: session.signOut,
    }),
    [status, user, session],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}
