import { cartSchema } from '@gear-store/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer, deferred, USERS, type FakeServer } from '../test/fake-api';
import { fakes, resetFakes } from '../test/fakes';

const REFRESH_KEY = 'rakit.refresh-token';
let server: FakeServer;

/** a fresh app: module state starts over, storage keeps what the last run left */
async function launch() {
  vi.resetModules();
  return import('./auth');
}

const signedInAs = async (m: Awaited<ReturnType<typeof launch>>, user: keyof typeof USERS) => {
  await m.auth.signIn({ email: USERS[user].email, password: 'secret-password' });
  expect(m.currentUserId()).toBe(USERS[user].id);
};

const offline = () => {
  globalThis.fetch = (async () => {
    throw new TypeError('Network request failed');
  }) as typeof fetch;
};
const online = () => {
  globalThis.fetch = ((url: string, init?: RequestInit) => server.fetch(url, init)) as typeof fetch;
};
const revokedTokens = () =>
  server.calls('/auth/native/logout').map((c) => (c.body as { refreshToken: string }).refreshToken);

beforeEach(() => {
  resetFakes();
  server = createServer();
  online();
});

describe('authedApi', () => {
  it('does not resend a call as another account that signed in while it was out', async () => {
    const m = await launch();
    await signedInAs(m, 'a');
    server.expireAccess(USERS.a.id);
    const hold = deferred();
    server.gate('/me/cart/items', { wait: hold.wait });
    const put = m.authedApi('/me/cart/items', cartSchema, {
      method: 'PUT',
      body: { slug: 'folding-lock', colorKey: '', quantity: 3 },
    });
    await m.auth.signOut();
    await signedInAs(m, 'b');
    hold.resolve();

    await expect(put).rejects.toMatchObject({ status: 401 });
    expect(server.calls('/me/cart/items')).toHaveLength(1);
    expect(server.carts.get(USERS.b.id)).toBeUndefined();
  });

  it('refreshes once for any number of calls that meet an expired token together', async () => {
    const m = await launch();
    await signedInAs(m, 'a');
    server.expireAccess(USERS.a.id);
    const carts = await Promise.all(Array.from({ length: 5 }, () => m.authedApi('/me/cart', cartSchema)));
    expect(carts).toHaveLength(5);
    expect(server.calls('/auth/native/refresh')).toHaveLength(1);
  });

  it('fails as signed out when the session ends during its refresh', async () => {
    const m = await launch();
    await signedInAs(m, 'a');
    server.expireAccess(USERS.a.id);
    const hold = deferred();
    server.gate('/auth/native/refresh', { wait: hold.wait, after: true });
    const call = m.authedApi('/me/cart', cartSchema);
    await vi.waitFor(() => expect(server.calls('/auth/native/refresh')).toHaveLength(1));
    await m.auth.signOut();
    hold.resolve();
    await expect(call).rejects.toMatchObject({ status: 401 });
    expect(server.calls('/me/cart')).toHaveLength(1);
  });
});

describe('restore', () => {
  it.each([401, 400])('forgets the stored session when the API answers %i', async (status) => {
    fakes.secure.set(REFRESH_KEY, 'r'.padEnd(43, 'x'));
    server.gate('/auth/native/refresh', { reply: { status, body: { message: 'Session expired' } } });
    const m = await launch();
    expect(await m.auth.restore()).toBe(false);
    expect(m.currentUserId()).toBeNull();
    expect(fakes.secure.has(REFRESH_KEY)).toBe(false);
  });

  it.each([429, 503])('keeps the stored session when the API answers %i', async (status) => {
    const first = await launch();
    await signedInAs(first, 'a');
    const stored = fakes.secure.get(REFRESH_KEY);
    server.gate('/auth/native/refresh', { reply: { status, body: {} } });
    const m = await launch();
    expect(await m.auth.restore()).toBe(false);
    expect(m.currentUserId()).toBeNull();
    expect(fakes.secure.get(REFRESH_KEY)).toBe(stored);
  });

  it('keeps the session through an offline launch and resumes it once the app is back in the foreground', async () => {
    const first = await launch();
    await signedInAs(first, 'a');
    offline();
    const m = await launch();
    expect(await m.auth.restore()).toBe(false);
    expect(m.currentUserId()).toBeNull();
    expect(fakes.secure.has(REFRESH_KEY)).toBe(true);

    online();
    expect(await m.auth.resume()).toBe(true);
    expect(m.currentUserId()).toBe(USERS.a.id);
  });

  it('does not resume after the shopper signed out', async () => {
    const m = await launch();
    await signedInAs(m, 'a');
    await m.auth.signOut();
    expect(await m.auth.resume()).toBe(false);
    expect(server.calls('/auth/native/refresh')).toHaveLength(0);
  });
});

describe('sign-in and sign-out', () => {
  it('ends the session left on the phone when another starts, and only that one', async () => {
    const first = await launch();
    await signedInAs(first, 'a');
    const left = fakes.secure.get(REFRESH_KEY)!;
    offline();
    const m = await launch();
    await m.auth.restore();
    online();

    await signedInAs(m, 'b');
    const current = fakes.secure.get(REFRESH_KEY)!;
    await vi.waitFor(() => expect(revokedTokens()).toEqual([left]));
    expect(current).not.toBe(left);
    await expect(m.authedApi('/me/cart', cartSchema)).resolves.toBeDefined();
  });

  it('signs out at once, and revokes the pair a refresh brings back afterwards instead of keeping it', async () => {
    const m = await launch();
    await signedInAs(m, 'a');
    server.expireAccess(USERS.a.id);
    const hold = deferred();
    server.gate('/auth/native/refresh', { wait: hold.wait, after: true });
    const call = m.authedApi('/me/cart', cartSchema);
    await vi.waitFor(() => expect(server.calls('/auth/native/refresh')).toHaveLength(1));

    await m.auth.signOut();
    expect(m.currentUserId()).toBeNull();
    expect(fakes.secure.has(REFRESH_KEY)).toBe(false);

    hold.resolve();
    await expect(call).rejects.toMatchObject({ status: 401 });
    const late = [...server.refreshTokens.keys()].at(-1)!;
    await vi.waitFor(() => expect(revokedTokens()).toContain(late));
    expect(m.currentUserId()).toBeNull();
    expect(fakes.secure.has(REFRESH_KEY)).toBe(false);
  });

  it('signs in at once while a refresh of the earlier session is still out, and revokes what it brings back', async () => {
    const first = await launch();
    await signedInAs(first, 'a');
    offline();
    const m = await launch();
    await m.auth.restore();
    online();
    const hold = deferred();
    server.gate('/auth/native/refresh', { wait: hold.wait, after: true });
    const resumed = m.auth.resume();
    await vi.waitFor(() => expect(server.calls('/auth/native/refresh')).toHaveLength(1));

    await signedInAs(m, 'b');
    const kept = fakes.secure.get(REFRESH_KEY);
    hold.resolve();
    expect(await resumed).toBe(false);
    const late = [...server.refreshTokens].filter(([, t]) => t.userId === USERS.a.id).at(-1)![0];
    await vi.waitFor(() => expect(revokedTokens()).toContain(late));
    expect(m.currentUserId()).toBe(USERS.b.id);
    expect(fakes.secure.get(REFRESH_KEY)).toBe(kept);
  });

  it('says so plainly and ends the new session when the phone cannot store it', async () => {
    const m = await launch();
    fakes.secureWriteFails = true;
    await expect(m.auth.signIn({ email: USERS.a.email, password: 'secret-password' })).rejects.toThrow(
      'This phone could not keep you signed in. Try again.',
    );
    expect(m.currentUserId()).toBeNull();
    const issued = [...server.refreshTokens.keys()].at(-1)!;
    await vi.waitFor(() => expect(revokedTokens()).toEqual([issued]));
  });

  it('ends the session cleanly when a refreshed pair cannot be stored', async () => {
    const m = await launch();
    await signedInAs(m, 'a');
    server.expireAccess(USERS.a.id);
    fakes.secureWriteFails = true;
    await expect(m.authedApi('/me/cart', cartSchema)).rejects.toMatchObject({ status: 401 });
    expect(m.currentUserId()).toBeNull();
    expect(fakes.secure.has(REFRESH_KEY)).toBe(false);
    const rotated = [...server.refreshTokens.keys()].at(-1)!;
    await vi.waitFor(() => expect(revokedTokens()).toEqual([rotated]));
  });
});
