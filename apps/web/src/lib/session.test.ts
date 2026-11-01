import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './api';
import { createSession, hasHint, type SessionEvents } from './session';

const HINT = 'rakit:has-session';
const users = {
  a: {
    id: crypto.randomUUID(),
    email: 'a@test.example',
    name: 'A',
    role: 'CUSTOMER',
    emailVerified: true,
    isDemo: false,
  },
  b: {
    id: crypto.randomUUID(),
    email: 'b@test.example',
    name: 'B',
    role: 'ADMIN',
    emailVerified: true,
    isDemo: false,
  },
} as const;

type Handler = (init: RequestInit) => Response | Promise<Response>;
const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status });
const issued = (token: string, user: keyof typeof users = 'a', expiresIn = 900) =>
  json(200, { accessToken: token, expiresIn, user: users[user] });

let routes: Record<string, Handler>;
let calls: { route: string; init: RequestInit }[];
const store = new Map<string, string>();
let storageFails = false;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

function session() {
  const events = {
    signedIn: vi.fn<SessionEvents['signedIn']>(),
    signedOut: vi.fn<SessionEvents['signedOut']>(),
    unreachable: vi.fn<SessionEvents['unreachable']>(),
  };
  return { s: createSession(events), events };
}
const sent = (route: string) => calls.filter((c) => c.route === route);
const bearer = (c: { init: RequestInit }) => (c.init.headers as Record<string, string>).Authorization;

beforeEach(() => {
  routes = {};
  calls = [];
  store.clear();
  storageFails = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const route = `${init.method ?? 'GET'} ${url.slice('/api'.length)}`;
      calls.push({ route, init });
      const handler = routes[route];
      if (!handler) throw new TypeError('Failed to fetch');
      return handler(init);
    }),
  );
  const guard = () => {
    if (storageFails) throw new DOMException('blocked', 'SecurityError');
  };
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (guard(), store.get(k) ?? null),
    setItem: (k: string, v: string) => (guard(), void store.set(k, v)),
    removeItem: (k: string) => (guard(), void store.delete(k)),
  });
  vi.stubGlobal('navigator', {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('restoring a session', () => {
  it('asks for nothing when this browser holds no session', () => {
    const { s } = session();
    s.start();
    expect(calls).toHaveLength(0);
    expect(hasHint()).toBe(false);
  });

  it('renews the session the hint names, and keeps the token for calls', async () => {
    store.set(HINT, '1');
    routes['POST /auth/refresh'] = () => issued('t1');
    const { s, events } = session();
    s.start();
    await vi.waitFor(() => expect(events.signedIn).toHaveBeenCalledWith(users.a));
    const seen = await s.authed(async (token) => token);
    expect(seen).toBe('t1');
    expect(sent('POST /auth/refresh')).toHaveLength(1);
  });

  it('ends the session and forgets the hint when the API refuses the refresh', async () => {
    store.set(HINT, '1');
    routes['POST /auth/refresh'] = () => json(401, { message: 'Session expired' });
    const { s, events } = session();
    expect(await s.refresh()).toBeNull();
    expect(events.signedOut).toHaveBeenCalledOnce();
    expect(events.unreachable).not.toHaveBeenCalled();
    expect(hasHint()).toBe(false);
  });

  it.each([
    ['offline', undefined],
    ['a server failure', () => json(503)],
    ['a throttled refresh', () => json(429)],
    ['an unreadable reply', () => new Response('<html>', { status: 200 })],
    ['a reply that is not a session', () => json(200, { accessToken: 't1' })],
  ])('keeps the hint to try again on the next load after %s', async (_, handler) => {
    store.set(HINT, '1');
    if (handler) routes['POST /auth/refresh'] = handler;
    const { s, events } = session();
    expect(await s.refresh()).toBeNull();
    expect(events.unreachable).toHaveBeenCalledOnce();
    expect(events.signedIn).not.toHaveBeenCalled();
    expect(events.signedOut).not.toHaveBeenCalled();
    expect(hasHint()).toBe(true);
  });

  it('works without storage: nothing to restore, and signing in still works', async () => {
    storageFails = true;
    routes['POST /auth/login'] = () => issued('t1');
    const { s, events } = session();
    expect(hasHint()).toBe(false);
    s.start();
    expect(calls).toHaveLength(0);
    await s.signIn({ email: 'a@test.example', password: 'long enough' });
    expect(events.signedIn).toHaveBeenCalledWith(users.a);
    expect(await s.authed(async (token) => token)).toBe('t1');
    await expect(s.signOut()).rejects.toThrow();
    expect(events.signedOut).toHaveBeenCalledOnce();
  });

  it('reads only the exact hint value', () => {
    store.set(HINT, 'true');
    expect(hasHint()).toBe(false);
  });
});

describe('one refresh at a time', () => {
  it('sends one refresh for every caller that asks while it is out', async () => {
    const reply = deferred<Response>();
    routes['POST /auth/refresh'] = () => reply.promise;
    const { s } = session();
    const all = Promise.all([s.refresh(), s.refresh(), s.refresh()]);
    reply.resolve(issued('t1'));
    expect(await all).toEqual(['t1', 't1', 't1']);
    expect(sent('POST /auth/refresh')).toHaveLength(1);
    // settled: the next one is a new request
    routes['POST /auth/refresh'] = () => issued('t2');
    expect(await s.refresh()).toBe('t2');
  });

  it('queues the refreshes of two tabs under one Web Lock, so a rotated cookie is never sent twice', async () => {
    let held: Promise<unknown> = Promise.resolve();
    const request = vi.fn((name: string, task: () => Promise<unknown>) => {
      const run = held.then(task);
      held = run.catch(() => undefined);
      expect(name).toBe('rakit-refresh');
      return run;
    });
    vi.stubGlobal('navigator', { locks: { request } });
    let inFlight = 0;
    let most = 0;
    let n = 0;
    routes['POST /auth/refresh'] = async () => {
      most = Math.max(most, ++inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      return issued(`t${++n}`);
    };
    const tab1 = session().s;
    const tab2 = session().s;
    expect(await Promise.all([tab1.refresh(), tab2.refresh()])).toEqual(['t1', 't2']);
    expect(request).toHaveBeenCalledTimes(2);
    expect(most).toBe(1);
  });

  it('tries again after a lock that failed, instead of waiting on it for ever', async () => {
    vi.stubGlobal('navigator', { locks: { request: () => Promise.reject(new Error('lock refused')) } });
    routes['POST /auth/refresh'] = () => issued('t1');
    const { s } = session();
    await expect(s.refresh()).rejects.toThrow('lock refused');
    vi.stubGlobal('navigator', {});
    expect(await s.refresh()).toBe('t1');
  });
});

describe('renewal before expiry', () => {
  it.each([
    [900, 840_000],
    [71, 11_000],
    [70, 10_000],
    [1, 10_000],
  ])('renews a token that lives %i s after %i ms', async (expiresIn, after) => {
    vi.useFakeTimers();
    routes['POST /auth/login'] = () => issued('t1', 'a', expiresIn);
    routes['POST /auth/refresh'] = () => issued('t2');
    const { s } = session();
    await s.signIn({ email: 'a@test.example', password: 'x' });
    await vi.advanceTimersByTimeAsync(after - 1);
    expect(sent('POST /auth/refresh')).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(sent('POST /auth/refresh')).toHaveLength(1);
    expect(await s.authed(async (token) => token)).toBe('t2');
  });

  it('keeps one renewal timer when another account signs in', async () => {
    vi.useFakeTimers();
    routes['POST /auth/login'] = () => issued('ta', 'a', 120);
    routes['POST /auth/demo'] = () => issued('tb', 'b', 900);
    routes['POST /auth/refresh'] = () => issued('tb2', 'b');
    const { s, events } = session();
    await s.signIn({ email: 'a@test.example', password: 'x' });
    await s.signInDemo('admin');
    expect(JSON.parse(sent('POST /auth/demo')[0]!.init.body as string)).toEqual({ role: 'admin' });
    expect(events.signedIn).toHaveBeenLastCalledWith(users.b);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sent('POST /auth/refresh')).toHaveLength(0);
    expect(await s.authed(async (token) => token)).toBe('tb');
  });

  it('stops renewing once the page lets go of the session', async () => {
    vi.useFakeTimers();
    routes['POST /auth/login'] = () => issued('t1', 'a', 120);
    const { s } = session();
    const stop = s.start();
    await s.signIn({ email: 'a@test.example', password: 'x' });
    stop();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(sent('POST /auth/refresh')).toHaveLength(0);
  });

  it('stops renewing after sign-out', async () => {
    vi.useFakeTimers();
    routes['POST /auth/login'] = () => issued('t1', 'a', 120);
    routes['POST /auth/logout'] = () => json(204);
    const { s } = session();
    await s.signIn({ email: 'a@test.example', password: 'x' });
    await s.signOut();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(sent('POST /auth/refresh')).toHaveLength(0);
  });
});

describe('authed', () => {
  const signedIn = async () => {
    routes['POST /auth/login'] = () => issued('t1');
    const made = session();
    await made.s.signIn({ email: 'a@test.example', password: 'x' });
    return made;
  };

  it('refuses at once, without calling, when there is no session to renew', async () => {
    routes['POST /auth/refresh'] = () => json(401);
    const { s } = session();
    const call = vi.fn();
    await expect(s.authed(call)).rejects.toMatchObject({ status: 401, message: 'Sign in to continue' });
    expect(call).not.toHaveBeenCalled();
  });

  it('renews an expired token once and repeats the call with the new one', async () => {
    const { s } = await signedIn();
    routes['POST /auth/refresh'] = () => issued('t2');
    const call = vi.fn(async (token: string) => {
      if (token === 't1') throw new ApiError(401, 'Unauthorized');
      return 'ok';
    });
    expect(await s.authed(call)).toBe('ok');
    expect(call.mock.calls.map(([t]) => t)).toEqual(['t1', 't2']);
  });

  it('never loops: a repeated call that is refused again fails', async () => {
    const { s } = await signedIn();
    routes['POST /auth/refresh'] = () => issued('t2');
    const call = vi.fn(async () => {
      throw new ApiError(401, 'Unauthorized');
    });
    await expect(s.authed(call)).rejects.toMatchObject({ status: 401 });
    expect(call).toHaveBeenCalledTimes(2);
    expect(sent('POST /auth/refresh')).toHaveLength(1);
  });

  it('passes on any other failure without renewing', async () => {
    const { s } = await signedIn();
    for (const error of [new ApiError(403, 'Forbidden'), new ApiError(0, 'offline'), new TypeError('bug')]) {
      await expect(s.authed(() => Promise.reject(error))).rejects.toBe(error);
    }
    expect(sent('POST /auth/refresh')).toHaveLength(0);
  });

  it('renews once for several calls that meet an expired token together', async () => {
    const { s } = await signedIn();
    const reply = deferred<Response>();
    routes['POST /auth/refresh'] = () => reply.promise;
    const call = async (token: string) => {
      if (token === 't1') throw new ApiError(401, 'Unauthorized');
      return token;
    };
    const all = Promise.all([s.authed(call), s.authed(call), s.authed(call)]);
    await vi.waitFor(() => expect(sent('POST /auth/refresh')).toHaveLength(1));
    reply.resolve(issued('t2'));
    expect(await all).toEqual(['t2', 't2', 't2']);
    expect(sent('POST /auth/refresh')).toHaveLength(1);
  });

  it('fails with the original 401 when the session ended while the call was out (sign-out elsewhere)', async () => {
    const { s, events } = await signedIn();
    routes['POST /auth/refresh'] = () => json(401, { message: 'Session expired' });
    const refused = new ApiError(401, 'Unauthorized');
    await expect(s.authed(() => Promise.reject(refused))).rejects.toBe(refused);
    expect(events.signedOut).toHaveBeenCalledOnce();
    expect(hasHint()).toBe(false);
  });

  it('sends the bearer token on API calls made through it', async () => {
    const { s } = await signedIn();
    routes['GET /me/cart'] = () => json(200, {});
    const { api } = await import('./api');
    await s.authed((accessToken) => api('/me/cart', { accessToken }));
    expect(bearer(sent('GET /me/cart')[0]!)).toBe('Bearer t1');
  });
});

describe('signing in and out', () => {
  it('stays signed out when the password is wrong', async () => {
    routes['POST /auth/login'] = () => json(401, { message: 'Wrong email or password' });
    const { s, events } = session();
    await expect(s.signIn({ email: 'a@test.example', password: 'nope' })).rejects.toMatchObject({
      status: 401,
      message: 'Wrong email or password',
    });
    expect(events.signedIn).not.toHaveBeenCalled();
    expect(hasHint()).toBe(false);
  });

  it('signs out on the page even when the API cannot be reached', async () => {
    routes['POST /auth/login'] = () => issued('t1');
    const { s, events } = session();
    await s.signIn({ email: 'a@test.example', password: 'x' });
    expect(hasHint()).toBe(true);
    await expect(s.signOut()).rejects.toMatchObject({ status: 0 });
    expect(events.signedOut).toHaveBeenCalledOnce();
    expect(hasHint()).toBe(false);
    routes['POST /auth/refresh'] = () => json(401);
    await expect(s.authed(async (t) => t)).rejects.toMatchObject({ status: 401 });
  });

  it('a call still out at sign-out does not bring the session back', async () => {
    routes['POST /auth/login'] = () => issued('t1');
    routes['POST /auth/logout'] = () => json(204);
    routes['POST /auth/refresh'] = () => json(401);
    const { s, events } = session();
    await s.signIn({ email: 'a@test.example', password: 'x' });
    const reply = deferred<void>();
    const call = s.authed(async () => {
      await reply.promise;
      throw new ApiError(401, 'Unauthorized');
    });
    await s.signOut();
    reply.resolve();
    await expect(call).rejects.toMatchObject({ status: 401 });
    expect(events.signedIn).toHaveBeenCalledTimes(1);
    expect(hasHint()).toBe(false);
  });
});
