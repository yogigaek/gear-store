import Constants from 'expo-constants';
import type { z } from 'zod';

/** An error reply from the API, or a request that never reached it (status 0). */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * Where the API lives. A release build names it in EXPO_PUBLIC_API_URL; in development the app is served by
 * Metro on the developer's machine, and the API runs on that same machine, so its LAN address is reused.
 */
function apiBase(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL;
  if (configured) return configured.replace(/\/$/, '');
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  if (__DEV__ && host) return `http://${host}:3000/api`;
  throw new Error('This build has no store address: EXPO_PUBLIC_API_URL was not set when it was built.');
}

/** long enough for the hosted API to wake: Render's free tier took 75 s to answer after sleeping (27 Oct 2026) */
const REQUEST_TIMEOUT_MS = 90_000;

const UNREACHABLE = 'Cannot reach the store right now. Check your connection and try again.';
// read as a server fault (5xx): an order may still have been placed, so checkout keeps offering the same key
const UNREADABLE = 'The store sent a reply this app could not read. Try again.';

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  accessToken?: string | null;
}

/**
 * Calls the API and validates the reply against the shared schema, as the web app does. Without a schema the
 * reply is not read (204 No Content).
 */
export async function api<S extends z.ZodType>(
  path: string,
  schema: S,
  options?: RequestOptions,
): Promise<z.output<S>>;
export async function api(path: string, schema: undefined, options?: RequestOptions): Promise<void>;
export async function api(
  path: string,
  schema: z.ZodType | undefined,
  { method = 'GET', body, accessToken }: RequestOptions = {},
): Promise<unknown> {
  // outside the try below: a build without an address must say so, not that the store cannot be reached
  const url = `${apiBase()}${path}`;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
  // React Native's Android client has no timeout of its own; the timer also covers a body that stops arriving
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), REQUEST_TIMEOUT_MS);
  try {
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: timeout.signal,
      });
    } catch {
      throw new ApiError(0, UNREACHABLE);
    }
    if (!res.ok) {
      const reply = (await res.json().catch(() => null)) as { message?: unknown; code?: unknown } | null;
      const message = Array.isArray(reply?.message) ? reply.message[0] : reply?.message;
      // as on the web: the throttler's 429 says "ThrottlerException: …"; a coded one (a paused sign-in) says how long
      const throttled = res.status === 429 && typeof reply?.code !== 'string';
      throw new ApiError(
        res.status,
        typeof message === 'string' && !throttled
          ? message
          : res.status === 429
            ? 'Too many attempts. Wait a minute and try again.'
            : 'Something went wrong. Try again.',
      );
    }
    if (!schema) return undefined;
    let data: unknown;
    try {
      data = await res.json();
    } catch {
      throw timeout.signal.aborted ? new ApiError(0, UNREACHABLE) : new ApiError(502, UNREADABLE);
    }
    const parsed = schema.safeParse(data);
    if (!parsed.success) throw new ApiError(502, UNREADABLE);
    return parsed.data;
  } finally {
    clearTimeout(timer);
  }
}

/** for queries: an unknown or malformed address will not turn up by asking again; anything else may */
export const retryTransient = (count: number, error: Error) =>
  !(error instanceof ApiError && (error.status === 404 || error.status === 400)) && count < 3;
