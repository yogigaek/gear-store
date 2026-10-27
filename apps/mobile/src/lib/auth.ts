import {
  nativeAuthResponseSchema,
  type DemoLoginInput,
  type LoginInput,
  type NativeAuthResponse,
  type User,
} from '@gear-store/shared';
import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';
import type { z } from 'zod';
import { api, ApiError, type RequestOptions } from './api';

// The access token lives in memory only; the refresh token in the platform's secure storage (Keychain /
// Keystore), as the httpOnly cookie does for the web. The API rotates the refresh token on every use and ends the
// session if a used one comes back, so every step that reads or replaces the stored token (refresh, sign-in,
// sign-out) runs one at a time through `exclusive`, and concurrent refreshes share a single request.
const REFRESH_KEY = 'rakit.refresh-token';

export type AuthState =
  { status: 'restoring' } | { status: 'signed-out' } | { status: 'signed-in'; user: User };

let state: AuthState = { status: 'restoring' };
let accessToken: string | null = null;
let inflight: Promise<boolean> | null = null;
let queue: Promise<unknown> = Promise.resolve();
const listeners = new Set<() => void>();

function exclusive<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

function set(next: AuthState) {
  state = next;
  listeners.forEach((l) => l());
}

async function adopt(session: NativeAuthResponse) {
  await SecureStore.setItemAsync(REFRESH_KEY, session.refreshToken);
  accessToken = session.accessToken;
  set({ status: 'signed-in', user: session.user });
}

async function forget() {
  accessToken = null;
  await SecureStore.deleteItemAsync(REFRESH_KEY).catch(() => undefined);
  set({ status: 'signed-out' });
}

/** best effort: the server session also expires on its own if this does not get through */
const revoke = (refreshToken: string) =>
  api('/auth/native/logout', undefined, { method: 'POST', body: { refreshToken } }).catch(() => undefined);

/** Swaps the stored refresh token for a new pair. False when there is no session to keep. */
function refresh(): Promise<boolean> {
  inflight ??= exclusive(async () => {
    try {
      const refreshToken = await SecureStore.getItemAsync(REFRESH_KEY);
      if (!refreshToken) {
        await forget();
        return false;
      }
      await adopt(
        await api('/auth/native/refresh', nativeAuthResponseSchema, {
          method: 'POST',
          body: { refreshToken },
        }),
      );
      return true;
    } catch (error) {
      // 401: the server ended the session (or the token is malformed, 400). Anything else (offline, a busy or
      // waking server, a throttle) says nothing about the session, so the token is kept for the next try.
      if (error instanceof ApiError && (error.status === 401 || error.status === 400)) {
        await forget();
        return false;
      }
      if (state.status === 'restoring') set({ status: 'signed-out' });
      throw error;
    } finally {
      inflight = null;
    }
  });
  return inflight;
}

/** Starts a new session; a session left on the phone (kept after an offline launch) is ended on the server. */
async function startSession(request: () => Promise<NativeAuthResponse>) {
  const session = await request();
  const previous = await exclusive(async () => {
    const stored = await SecureStore.getItemAsync(REFRESH_KEY).catch(() => null);
    await adopt(session);
    return stored;
  });
  if (previous && previous !== session.refreshToken) await revoke(previous);
}

export const auth = {
  /** at launch: resumes the stored session, if any */
  restore: () => refresh().catch(() => false),
  signIn: (input: LoginInput) =>
    startSession(() => api('/auth/native/login', nativeAuthResponseSchema, { method: 'POST', body: input })),
  signInDemo: (role: DemoLoginInput['role']) =>
    startSession(() =>
      api('/auth/native/demo', nativeAuthResponseSchema, { method: 'POST', body: { role } }),
    ),
  async signOut() {
    const refreshToken = await exclusive(async () => {
      const stored = await SecureStore.getItemAsync(REFRESH_KEY).catch(() => null);
      await forget();
      return stored;
    });
    if (refreshToken) await revoke(refreshToken);
  },
};

/** Calls the API as the signed-in user; an expired access token is refreshed once and the call repeated. */
export async function authedApi<S extends z.ZodType>(
  path: string,
  schema: S,
  options: RequestOptions = {},
): Promise<z.output<S>> {
  if (!accessToken && !(await refresh())) throw new ApiError(401, 'Sign in to continue');
  try {
    return await api(path, schema, { ...options, accessToken });
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401 || !(await refresh())) throw error;
    return api(path, schema, { ...options, accessToken });
  }
}

/** the signed-in account's id, or null: async work reads it again to make sure the account has not changed */
export function currentUserId(): string | null {
  return state.status === 'signed-in' ? state.user.id : null;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAuth(): AuthState {
  return useSyncExternalStore(subscribe, () => state);
}
