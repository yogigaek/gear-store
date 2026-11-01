import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from './api';

const reply = (status: number, body: unknown) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );

const failure = async () => {
  try {
    await api('/anything');
  } catch (error) {
    return error as ApiError;
  }
  throw new Error('expected a failure');
};

afterEach(() => vi.unstubAllGlobals());

describe('api errors', () => {
  it('passes on what the API says about a request it refused', async () => {
    reply(409, { statusCode: 409, message: 'Only 2 of Fender set left.' });
    expect((await failure()).message).toBe('Only 2 of Fender set left.');
  });

  it('never shows a server failure in its own words', async () => {
    reply(500, { statusCode: 500, message: 'Midtrans 401 at api.sandbox…' });
    const error = await failure();
    expect(error.message).toBe('Something went wrong on our side.');
    expect(error.status).toBe(500);
    expect(error.code).toBeUndefined();
  });

  it('shows a server failure the API wrote for the shopper, marked by its code', async () => {
    const message = 'The payment provider is not responding. Try again in a minute.';
    reply(503, { statusCode: 503, message, code: 'PAYMENTS_UNAVAILABLE' });
    const error = await failure();
    expect(error.message).toBe(message);
    expect(error.status).toBe(503);
    expect(error.code).toBe('PAYMENTS_UNAVAILABLE');
  });

  it('hides a throttler 429 but shows a coded one', async () => {
    reply(429, { statusCode: 429, message: 'ThrottlerException: Too Many Requests' });
    expect((await failure()).message).toBe('Too many attempts. Wait a minute.');
    reply(429, {
      statusCode: 429,
      message: 'Too many failed sign-ins. Try again in 60 seconds.',
      code: 'SIGN_IN_PAUSED',
    });
    expect((await failure()).message).toBe('Too many failed sign-ins. Try again in 60 seconds.');
  });

  it('says the store is out of reach when the request never arrives', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    const error = await failure();
    expect(error.status).toBe(0);
    expect(error.message).toBe('Cannot reach the store right now.');
  });
});

describe('api requests and replies', () => {
  const sent = () => (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];

  it('sends JSON with the token only when there is one, same-origin, under /api', async () => {
    reply(200, { ok: true });
    await api('/me/cart/items', { method: 'PUT', body: { quantity: 0 }, accessToken: 'tok' });
    const [url, init] = sent();
    expect(url).toBe('/api/me/cart/items');
    expect(init).toMatchObject({ method: 'PUT', body: '{"quantity":0}', credentials: 'same-origin' });
    expect(init.headers).toEqual({
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: 'Bearer tok',
    });
    reply(200, {});
    await api('/categories', { accessToken: null });
    expect(sent()[1]).toMatchObject({
      method: 'GET',
      body: undefined,
      headers: { Accept: 'application/json' },
    });
  });

  it('checks a reply against its schema, and reads nothing for 204 or without one', async () => {
    const { z } = await import('zod');
    const schema = z.object({ n: z.number() });
    reply(200, { n: 1 });
    expect(await api('/x', { schema })).toEqual({ n: 1 });
    reply(200, { n: 'one' });
    await expect(api('/x', { schema })).rejects.toBeInstanceOf(z.ZodError);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 204 })),
    );
    expect(await api('/x', { schema })).toBeUndefined();
    reply(200, 'not read');
    expect(await api('/x')).toBeUndefined();
  });

  it('lets an aborted request fail as an abort, not as an unreachable store', async () => {
    const controller = new AbortController();
    const abort = new DOMException('aborted', 'AbortError');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        controller.abort();
        throw abort;
      }),
    );
    await expect(api('/x', { signal: controller.signal })).rejects.toBe(abort);
  });

  it('hands back the field issues of a refused form', async () => {
    reply(400, {
      message: 'Check the form',
      issues: [
        { path: 'email', message: 'Enter an email' },
        { path: 'password', message: 'Too short' },
      ],
    });
    const error = await failure();
    expect(error.fieldError('email')).toBe('Enter an email');
    expect(error.fieldError('name')).toBeUndefined();
  });

  it('reads the first of several messages, and ignores issues that are not a list', async () => {
    reply(400, { message: ['first', 'second'], issues: 'nope' });
    const error = await failure();
    expect(error.message).toBe('first');
    expect(error.issues).toEqual([]);
  });

  it('keeps the wait a paused sign-in names, only as a number', async () => {
    reply(429, { message: 'Paused', code: 'SIGN_IN_PAUSED', retryAfter: 60 });
    expect((await failure()).retryAfter).toBe(60);
    reply(429, { message: 'Paused', code: 'SIGN_IN_PAUSED', retryAfter: '60' });
    expect((await failure()).retryAfter).toBeUndefined();
  });

  it.each([
    [404, { message: 42 }, 'Something went wrong on our side.'],
    [400, {}, 'Something went wrong on our side.'],
    [500, { message: 'db down', code: 7 }, 'Something went wrong on our side.'],
    [429, { message: 'ThrottlerException', code: null }, 'Too many attempts. Wait a minute.'],
  ])('falls back to its own words for a %i that says %o', async (status, body, message) => {
    reply(status, body);
    const error = await failure();
    expect(error.message).toBe(message);
    expect(error.code).toBeUndefined();
  });

  it.each([
    [502, 'Something went wrong on our side.'],
    [429, 'Too many attempts. Wait a minute.'],
    [404, 'Something went wrong on our side.'],
  ])('reads a %i whose body is not JSON (a proxy page) in its own words', async (status, message) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>Bad gateway</html>', { status })),
    );
    const error = await failure();
    expect(error).toMatchObject({ status, message, issues: [] });
  });
});
