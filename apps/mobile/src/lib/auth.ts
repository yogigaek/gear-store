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
// Keystore), as the httpOnly cookie does for the web. The API rotates the refresh token on every use, so every
// read or write of the stored token runs one at a time through `exclusive`, and concurrent refreshes share a
// single request. Network calls stay outside that queue: signing in or out never waits behind a stalled refresh.
//
// `generation` names the session in use and moves on at every sign-in, sign-out and forced sign-out. Work started
// for one session checks it before it lands, so a late reply never resurrects a session or reaches the next one.
const REFRESH_KEY = 'rakit.refresh-token';

export type AuthState =
  { status: 'restoring' } | { status: 'signed-out' } | { status: 'signed-in'; user: User };

let state: AuthState = { status: 'restoring' };
let accessToken: string | null = null;
let generation = 0;
let inflight: { generation: number; result: Promise<boolean> } | null = null;
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

const signedOut = () => new ApiError(401, 'Sign in to continue');

/** best effort: the server session also expires on its own if this does not get through */
const revoke = (refreshToken: string) =>
  api('/auth/native/logout', undefined, { method: 'POST', body: { refreshToken } }).catch(() => undefined);

/** The server ended session `gen` (or none is stored): it ends on the phone too, unless it already has. */
async function forget(gen: number) {
  if (gen !== generation) return;
  generation++;
  accessToken = null;
  set({ status: 'signed-out' });
  await exclusive(() => SecureStore.deleteItemAsync(REFRESH_KEY)).catch(() => undefined);
}

/** Keeps a pair the refresh of session `gen` returned. False when that session has ended since or cannot be kept. */
async function adopt(session: NativeAuthResponse, gen: number): Promise<boolean> {
  const outcome = await exclusive(async () => {
    if (gen !== generation) return 'ended' as const;
    await SecureStore.setItemAsync(REFRESH_KEY, session.refreshToken);
    return 'kept' as const;
  }).catch(() => 'unsaved' as const);
  if (outcome === 'kept') {
    // ended while being written: the sign-out or sign-in queued after this write revokes what it finds stored
    if (gen !== generation) return false;
    accessToken = session.accessToken;
    set({ status: 'signed-in', user: session.user });
    return true;
  }
  void revoke(session.refreshToken);
  // the token it replaced was spent on the server, so a pair the phone could not store ends the session
  if (outcome === 'unsaved') await forget(gen);
  return false;
}

async function swap(gen: number): Promise<boolean> {
  try {
    const refreshToken = await exclusive(() => SecureStore.getItemAsync(REFRESH_KEY));
    if (gen !== generation) return false;
    if (!refreshToken) {
      await forget(gen);
      return false;
    }
    const session = await api('/auth/native/refresh', nativeAuthResponseSchema, {
      method: 'POST',
      body: { refreshToken },
    });
    return await adopt(session, gen);
  } catch (error) {
    if (gen !== generation) return false;
    // 401: the server ended the session (or the token is malformed, 400). Anything else (offline, a busy or
    // waking server, a throttle) says nothing about the session, so the token is kept for the next try.
    if (error instanceof ApiError && (error.status === 401 || error.status === 400)) {
      await forget(gen);
      return false;
    }
    if (state.status === 'restoring') set({ status: 'signed-out' });
    throw error;
  }
}

/** Swaps the stored refresh token for a new pair. False when there is no session to keep. */
function refresh(): Promise<boolean> {
  if (inflight?.generation === generation) return inflight.result;
  const entry = {
    generation,
    result: swap(generation).finally(() => {
      if (inflight === entry) inflight = null;
    }),
  };
  inflight = entry;
  return entry.result;
}

/**
 * Starts a new session. It takes over at once: a refresh still on its way for the session before is revoked when
 * it lands, and a session left on the phone (kept after an offline launch) is ended on the server.
 */
async function startSession(request: () => Promise<NativeAuthResponse>) {
  const session = await request();
  const gen = ++generation;
  accessToken = null;
  let outcome: { stored: string | null } | 'ended';
  try {
    outcome = await exclusive(async () => {
      if (gen !== generation) return 'ended' as const;
      const stored = await SecureStore.getItemAsync(REFRESH_KEY).catch(() => null);
      await SecureStore.setItemAsync(REFRESH_KEY, session.refreshToken);
      return { stored };
    });
  } catch {
    void revoke(session.refreshToken);
    if (gen === generation && state.status !== 'signed-out') set({ status: 'signed-out' });
    throw new Error('This phone could not keep you signed in. Try again.');
  }
  if (outcome === 'ended') {
    void revoke(session.refreshToken);
    return;
  }
  if (gen === generation) {
    accessToken = session.accessToken;
    set({ status: 'signed-in', user: session.user });
  }
  if (outcome.stored && outcome.stored !== session.refreshToken) void revoke(outcome.stored);
}

export const auth = {
  /** at launch: resumes the stored session, if any */
  restore: () => refresh().catch(() => false),
  /** back in the foreground: a session kept after a launch that could not reach the API is tried again */
  async resume(): Promise<boolean> {
    if (state.status !== 'signed-out') return false;
    const stored = await exclusive(() => SecureStore.getItemAsync(REFRESH_KEY)).catch(() => null);
    if (!stored || state.status !== 'signed-out') return false;
    return refresh().catch(() => false);
  },
  signIn: (input: LoginInput) =>
    startSession(() => api('/auth/native/login', nativeAuthResponseSchema, { method: 'POST', body: input })),
  signInDemo: (role: DemoLoginInput['role']) =>
    startSession(() =>
      api('/auth/native/demo', nativeAuthResponseSchema, { method: 'POST', body: { role } }),
    ),
  /** signed out on the phone at once; the stored token is then removed and ended on the server */
  async signOut() {
    generation++;
    accessToken = null;
    set({ status: 'signed-out' });
    const stored = await exclusive(async () => {
      const token = await SecureStore.getItemAsync(REFRESH_KEY).catch(() => null);
      await SecureStore.deleteItemAsync(REFRESH_KEY).catch(() => undefined);
      return token;
    });
    if (stored) void revoke(stored);
  },
};

/**
 * Calls the API as the signed-in user; an expired access token is refreshed once and the call repeated. A call
 * made for one session is never repeated for another: if the session changed meanwhile, it fails with a 401.
 */
export async function authedApi<S extends z.ZodType>(
  path: string,
  schema: S,
  options: RequestOptions = {},
): Promise<z.output<S>> {
  const gen = generation;
  if (!accessToken && (!(await refresh()) || gen !== generation)) throw signedOut();
  const sent = accessToken;
  try {
    return await api(path, schema, { ...options, accessToken: sent });
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
    if (gen !== generation) throw signedOut();
    // another call may have renewed the token while this one was out: then it is simply sent again
    if (accessToken === sent && !(await refresh())) throw signedOut();
    if (gen !== generation) throw signedOut();
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
