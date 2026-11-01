import {
  authResponseSchema,
  type AuthResponse,
  type DemoLoginInput,
  type LoginInput,
  type User,
} from '@gear-store/shared';
import { api, ApiError } from './api';

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

export function hasHint(): boolean {
  try {
    return localStorage.getItem(SESSION_HINT) === '1';
  } catch {
    return false;
  }
}

/** what the page hears from the session */
export interface SessionEvents {
  signedIn: (user: User) => void;
  /** signed out, or the API ended the session */
  signedOut: () => void;
  /** a refresh that could not reach the API: a page still restoring shows as signed out */
  unreachable: () => void;
}

export type Session = ReturnType<typeof createSession>;

/** The browser's session: the access token, its renewal, and the calls made with it (AuthProvider's logic). */
export function createSession(events: SessionEvents) {
  let token: string | null = null;
  let refreshing: Promise<string | null> | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const clear = () => {
    token = null;
    clearTimeout(timer);
    hint(false);
    events.signedOut();
  };

  const accept = (auth: AuthResponse) => {
    token = auth.accessToken;
    hint(true);
    events.signedIn(auth.user);
    clearTimeout(timer);
    // renew a minute early so requests never carry an expired token
    timer = setTimeout(() => void refresh(), Math.max(10, auth.expiresIn - 60) * 1000);
  };

  /**
   * One refresh at a time, across every open tab: the refresh token rotates, so two tabs sending the same
   * cookie would look like token theft and end the session. The Web Lock queues them; the second tab then
   * sends the already-rotated cookie.
   */
  const refresh = (): Promise<string | null> => {
    refreshing ??= (async () => {
      const run = async () => {
        try {
          accept(await api('/auth/refresh', { method: 'POST', schema: authResponseSchema }));
          return token;
        } catch (error) {
          if (error instanceof ApiError && error.status === 401) clear();
          // offline or server down: show the page as signed out, but keep the hint to retry on the next load
          else events.unreachable();
          return null;
        }
      };
      try {
        return navigator.locks ? await navigator.locks.request('rakit-refresh', run) : await run();
      } finally {
        refreshing = null;
      }
    })();
    return refreshing;
  };

  /** an API call with the access token; a 401 triggers one refresh and one retry */
  const authed = async <T>(call: (accessToken: string) => Promise<T>): Promise<T> => {
    const current = token ?? (await refresh());
    if (!current) throw new ApiError(401, 'Sign in to continue');
    try {
      return await call(current);
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error;
      const renewed = await refresh();
      if (!renewed) throw error;
      return call(renewed);
    }
  };

  return {
    refresh,
    authed,
    /** at mount: restores a session the hint says exists; the returned function stops the renewal timer */
    start() {
      if (hasHint()) void refresh();
      return () => clearTimeout(timer);
    },
    signIn: async (input: LoginInput) =>
      accept(await api('/auth/login', { method: 'POST', body: input, schema: authResponseSchema })),
    signInDemo: async (role: DemoLoginInput['role']) =>
      accept(await api('/auth/demo', { method: 'POST', body: { role }, schema: authResponseSchema })),
    signOut: async () => {
      try {
        await api('/auth/logout', { method: 'POST' });
      } finally {
        clear();
      }
    },
  };
}
