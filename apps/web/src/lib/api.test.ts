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
