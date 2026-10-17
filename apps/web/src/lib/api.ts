import type { z } from 'zod';

export interface ApiIssue {
  path: string;
  message: string;
}

/** An error reply from the API, with field issues when validation failed. */
export class ApiError extends Error {
  readonly status: number;
  readonly issues: ApiIssue[];
  readonly code: string | undefined;
  /** seconds to wait before trying again, when the API says (a paused sign-in) */
  readonly retryAfter: number | undefined;

  constructor(status: number, message: string, issues: ApiIssue[] = [], code?: string, retryAfter?: number) {
    super(message);
    this.status = status;
    this.issues = issues;
    this.code = code;
    this.retryAfter = retryAfter;
  }

  /** the message for one form field, if the API flagged it */
  fieldError(field: string): string | undefined {
    return this.issues.find((i) => i.path === field)?.message;
  }
}

interface RequestOptions<S extends z.ZodType> {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  accessToken?: string | null;
  schema?: S;
  signal?: AbortSignal;
}

/**
 * Calls the API (same origin: Vite proxies /api in development, Vercel in production) and validates the reply
 * against the shared schema, so a contract mismatch fails loudly here instead of deep inside a component.
 */
export async function api<S extends z.ZodType = z.ZodVoid>(
  path: string,
  { method = 'GET', body, accessToken, schema, signal }: RequestOptions<S> = {},
): Promise<z.output<S>> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError(0, 'Cannot reach the store right now. Check your connection and try again.');
  }

  if (!res.ok) throw await toApiError(res);
  if (res.status === 204 || !schema) return undefined as z.output<S>;
  return schema.parse(await res.json());
}

async function toApiError(res: Response): Promise<ApiError> {
  const fallback =
    res.status === 429
      ? 'Too many attempts. Wait a minute and try again.'
      : 'Something went wrong. Try again.';
  try {
    const body = (await res.json()) as {
      message?: unknown;
      issues?: unknown;
      code?: unknown;
      retryAfter?: unknown;
    };
    const message = Array.isArray(body.message) ? String(body.message[0]) : body.message;
    // a 429 from the throttler says "ThrottlerException: …"; one from a paused sign-in says how long to wait
    const own = typeof body.code === 'string';
    return new ApiError(
      res.status,
      typeof message !== 'string' || (res.status === 429 && !own) ? fallback : message,
      Array.isArray(body.issues) ? (body.issues as ApiIssue[]) : [],
      own ? (body.code as string) : undefined,
      typeof body.retryAfter === 'number' ? body.retryAfter : undefined,
    );
  } catch {
    return new ApiError(res.status, fallback);
  }
}
