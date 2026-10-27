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
  throw new Error('EXPO_PUBLIC_API_URL is not set');
}

/** long enough for the hosted API to wake from sleep on a slow connection */
const REQUEST_TIMEOUT_MS = 30_000;

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
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
  // React Native's Android client has no timeout of its own, and a stalled sign-in request would hold the
  // session queue in auth.ts (sign-out included) for as long as the connection hangs
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${apiBase()}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: timeout.signal,
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the store right now. Check your connection and try again.');
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const reply = (await res.json().catch(() => ({}))) as { message?: unknown };
    const message = Array.isArray(reply.message) ? reply.message[0] : reply.message;
    throw new ApiError(
      res.status,
      res.status === 429 && typeof message !== 'string'
        ? 'Too many attempts. Wait a minute and try again.'
        : typeof message === 'string'
          ? message
          : 'Something went wrong. Try again.',
    );
  }
  return schema ? schema.parse(await res.json()) : undefined;
}
