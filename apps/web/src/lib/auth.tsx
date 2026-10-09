import { authResponseSchema, type AuthResponse, type User } from '@gear-store/shared';
import { useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from './api';
import { AuthContext, type AuthValue, type Status } from './auth-context';

// The access token lives only in memory. The refresh token is an HttpOnly cookie the page cannot read, so a
// localStorage flag records whether there is a session worth restoring; guests then skip a pointless 401.
const SESSION_HINT = 'rakit:has-session';

function hint(on: boolean) {
  try {
    if (on) localStorage.setItem(SESSION_HINT, '1');
    else localStorage.removeItem(SESSION_HINT);
  } catch {
    // storage blocked (private mode): sessions still work, they just are not restored on reload
  }
}
function hasHint(): boolean {
  try {
    return localStorage.getItem(SESSION_HINT) === '1';
  } catch {
    return false;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Status>(() => (hasHint() ? 'restoring' : 'signed-out'));
  const [user, setUserState] = useState<User | null>(null);
  const token = useRef<string | null>(null);
  const refreshing = useRef<Promise<string | null> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const clear = useCallback(() => {
    token.current = null;
    clearTimeout(timer.current);
    hint(false);
    setUserState(null);
    setStatus('signed-out');
    queryClient.removeQueries({ queryKey: ['me'] });
  }, [queryClient]);

  const refreshRef = useRef<() => Promise<string | null>>(async () => null);

  const accept = useCallback((auth: AuthResponse) => {
    token.current = auth.accessToken;
    hint(true);
    setUserState(auth.user);
    setStatus('signed-in');
    clearTimeout(timer.current);
    // renew a minute early so requests never carry an expired token
    timer.current = setTimeout(() => void refreshRef.current(), Math.max(10, auth.expiresIn - 60) * 1000);
  }, []);

  /**
   * One refresh at a time, across every open tab: the refresh token rotates, so two tabs sending the same
   * cookie would look like token theft and end the session. The Web Lock queues them; the second tab then
   * sends the already-rotated cookie.
   */
  const refresh = useCallback((): Promise<string | null> => {
    refreshing.current ??= (async () => {
      const run = async () => {
        try {
          accept(await api('/auth/refresh', { method: 'POST', schema: authResponseSchema }));
          return token.current;
        } catch (error) {
          if (error instanceof ApiError && error.status === 401) clear();
          // offline or server down: show the page as signed out, but keep the hint to retry on the next load
          else setStatus((s) => (s === 'restoring' ? 'signed-out' : s));
          return null;
        }
      };
      try {
        return navigator.locks ? await navigator.locks.request('rakit-refresh', run) : await run();
      } finally {
        refreshing.current = null;
      }
    })();
    return refreshing.current;
  }, [accept, clear]);

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    if (hasHint()) void refresh();
    return () => clearTimeout(timer.current);
  }, [refresh]);

  const authed = useCallback(
    async <T,>(call: (accessToken: string) => Promise<T>): Promise<T> => {
      const current = token.current ?? (await refresh());
      if (!current) throw new ApiError(401, 'Sign in to continue');
      try {
        return await call(current);
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401) throw error;
        const renewed = await refresh();
        if (!renewed) throw error;
        return call(renewed);
      }
    },
    [refresh],
  );

  const value = useMemo<AuthValue>(
    () => ({
      status,
      user,
      authed,
      setUser: setUserState,
      signIn: async (input) =>
        accept(await api('/auth/login', { method: 'POST', body: input, schema: authResponseSchema })),
      signInDemo: async (role) =>
        accept(await api('/auth/demo', { method: 'POST', body: { role }, schema: authResponseSchema })),
      signOut: async () => {
        try {
          await api('/auth/logout', { method: 'POST' });
        } finally {
          clear();
        }
      },
    }),
    [status, user, authed, accept, clear],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}
