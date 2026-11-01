import { z } from 'zod';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, retryTransient } from './api';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const respond = (reply: (init: RequestInit) => Promise<Response> | Response) => {
  globalThis.fetch = (async (_url: string, init: RequestInit) => reply(init)) as typeof fetch;
};
/** waits until the request is aborted, then fails as fetch does */
const untilAborted = (signal: AbortSignal | null | undefined) =>
  new Promise<never>((_, reject) =>
    signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))),
  );
const named = z.object({ name: z.string() });

afterEach(() => {
  vi.useRealTimers();
  process.env.EXPO_PUBLIC_API_URL = 'http://api.test/api';
});

describe('api', () => {
  it('reads and checks the reply', async () => {
    respond(() => json(200, { name: 'lock' }));
    await expect(api('/x', named)).resolves.toEqual({ name: 'lock' });
  });

  it('gives up on a request that never answers', async () => {
    vi.useFakeTimers();
    respond((init) => untilAborted(init.signal));
    const call = expect(api('/x', named)).rejects.toMatchObject({ status: 0 });
    await vi.advanceTimersByTimeAsync(90_000);
    await call;
  });

  it('gives up on a reply whose body stops arriving', async () => {
    vi.useFakeTimers();
    respond(
      (init) =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('{"name":'));
              init.signal?.addEventListener('abort', () =>
                controller.error(new DOMException('Aborted', 'AbortError')),
              );
            },
          }),
          { status: 200 },
        ),
    );
    const call = expect(api('/x', named)).rejects.toMatchObject({
      status: 0,
      message: 'Cannot reach the store right now. Check your connection and try again.',
    });
    await vi.advanceTimersByTimeAsync(90_000);
    await call;
  });

  it.each([
    ['a body that is not JSON', () => new Response('<html>Bad gateway</html>', { status: 200 })],
    ['a reply of another shape', () => json(200, { title: 'lock' })],
  ])('turns %s into a plain message the app can show', async (_, reply) => {
    respond(reply);
    const error = await api('/x', named).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 502,
      message: 'The store sent a reply this app could not read. Try again.',
    });
  });

  it('uses the API message, or a plain one for a throttle without one', async () => {
    respond(() => json(409, { message: ['Only 2 left'] }));
    await expect(api('/x', named)).rejects.toMatchObject({ status: 409, message: 'Only 2 left' });
    respond(() => new Response('Too Many Requests', { status: 429 }));
    await expect(api('/x', named)).rejects.toMatchObject({
      status: 429,
      message: 'Too many attempts. Wait a minute and try again.',
    });
  });

  it("shows the throttler's own 429 text plainly, and a coded 429's message as the API wrote it", async () => {
    respond(() => json(429, { statusCode: 429, message: 'ThrottlerException: Too Many Requests' }));
    await expect(api('/x', named)).rejects.toMatchObject({
      status: 429,
      message: 'Too many attempts. Wait a minute and try again.',
    });
    const paused = 'Too many failed sign-ins. Try again in 2 minutes.';
    respond(() => json(429, { statusCode: 429, message: paused, code: 'SIGN_IN_PAUSED', retryAfter: 120 }));
    await expect(api('/x', named)).rejects.toMatchObject({ status: 429, message: paused });
  });

  it('says a build has no store address rather than that the store cannot be reached', async () => {
    delete process.env.EXPO_PUBLIC_API_URL;
    const fetch = vi.fn();
    globalThis.fetch = fetch;
    await expect(api('/x', named)).rejects.toThrow('EXPO_PUBLIC_API_URL');
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('api address', () => {
  afterEach(() => {
    (globalThis as { __DEV__?: boolean }).__DEV__ = false;
  });

  it('drops a trailing slash from the configured address', async () => {
    process.env.EXPO_PUBLIC_API_URL = 'http://api.test/api/';
    const fetch = vi.fn(async () => json(200, { name: 'lock' }));
    globalThis.fetch = fetch as unknown as typeof globalThis.fetch;
    await api('/x', named);
    expect((fetch.mock.calls[0] as unknown as [string])[0]).toBe('http://api.test/api/x');
  });

  it('uses the developer machine’s API in a development build without an address', async () => {
    delete process.env.EXPO_PUBLIC_API_URL;
    (globalThis as { __DEV__?: boolean }).__DEV__ = true;
    const fetch = vi.fn(async () => json(200, { name: 'lock' }));
    globalThis.fetch = fetch as unknown as typeof globalThis.fetch;
    await api('/x', named);
    expect((fetch.mock.calls[0] as unknown as [string])[0]).toBe('http://localhost:3000/api/x');
  });

  it('sends JSON with the token only when there is one, and reads nothing without a schema', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    globalThis.fetch = fetch as unknown as typeof globalThis.fetch;
    await expect(
      api('/x', undefined, { method: 'POST', body: { a: 1 }, accessToken: 'tok' }),
    ).resolves.toBeUndefined();
    expect((fetch.mock.calls[0] as unknown as [string, RequestInit])[1]).toMatchObject({
      method: 'POST',
      body: '{"a":1}',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: 'Bearer tok',
      },
    });
  });

  it.each([
    [500, 'not json', 'Something went wrong. Try again.'],
    [404, { message: ['first', 'second'] }, 'first'],
    [400, { message: 42 }, 'Something went wrong. Try again.'],
    [429, 'not json', 'Too many attempts. Wait a minute and try again.'],
  ])('reads a %i replying %j as %j', async (status, body, message) => {
    respond(() => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }));
    await expect(api('/x', named)).rejects.toMatchObject({ status, message });
  });

  it('reads a reply that is not the expected shape as a server fault', async () => {
    respond(() => json(200, { name: 1 }));
    await expect(api('/x', named)).rejects.toMatchObject({ status: 502 });
    respond(() => new Response('<html>', { status: 200 }));
    await expect(api('/x', named)).rejects.toMatchObject({ status: 502 });
  });
});

describe('retryTransient', () => {
  it.each([404, 400])('does not ask again after a %i', (status) => {
    expect(retryTransient(0, new ApiError(status, 'x'))).toBe(false);
  });

  it.each([0, 500, 503])('asks again after a %i, three times at most', (status) => {
    const error = new ApiError(status, 'x');
    expect([0, 1, 2, 3].map((count) => retryTransient(count, error))).toEqual([true, true, true, false]);
  });
});
