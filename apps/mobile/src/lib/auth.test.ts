import { cartSchema } from '@gear-store/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer, deferred, USERS, type FakeServer } from '../test/fake-api';
import { fakes, resetFakes } from '../test/fakes';

// useAuth read as React would: the store's subscribe, then its snapshot
const external = vi.hoisted(() => ({ subscribe: null as ((notify: () => void) => () => void) | null }));
vi.mock('react', async (actual) => ({
  ...(await actual<typeof import('react')>()),
  useSyncExternalStore: (subscribe: (n: () => void) => () => void, read: () => unknown) => {
    external.subscribe = subscribe;
    return read();
  },
}));

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

describe('a session that changes while work for it is out', () => {
  /** holds the next SecureStore write; `entered` settles once it is waiting */
  const holdNextSecureWrite = () => {
    const entered = deferred();
    const release = deferred();
    fakes.beforeSecureWrite = () => {
      fakes.beforeSecureWrite = null;
      entered.resolve();
      return release.wait;
    };
    return { entered: entered.wait, release: release.resolve };
  };
  const tokensOf = (user: keyof typeof USERS) =>
    [...server.refreshTokens].filter(([, t]) => t.userId === USERS[user].id).map(([token]) => token);

  it('does not keep a refreshed pair when a sign-out lands while it is being stored', async () => {
    const m = await launch();
    await signedInAs(m, 'a');
    server.expireAccess(USERS.a.id);
    const write = holdNextSecureWrite();
    const call = m.authedApi('/me/cart', cartSchema);
    await write.entered;
    const signingOut = m.auth.signOut();
    expect(m.currentUserId()).toBeNull();
    write.release();
    await signingOut;

    await expect(call).rejects.toMatchObject({ status: 401 });
    expect(m.currentUserId()).toBeNull();
    expect(fakes.secure.has(REFRESH_KEY)).toBe(false);
    await vi.waitFor(() => expect(revokedTokens()).toContain(tokensOf('a').at(-1)));
  });

  it('does not sign in when a sign-out lands while the new session is being stored', async () => {
    const m = await launch();
    const write = holdNextSecureWrite();
    const signingIn = m.auth.signIn({ email: USERS.a.email, password: 'secret-password' });
    await write.entered;
    const signingOut = m.auth.signOut();
    write.release();
    await signingIn;
    await signingOut;

    expect(m.currentUserId()).toBeNull();
    expect(fakes.secure.has(REFRESH_KEY)).toBe(false);
    await vi.waitFor(() => expect(revokedTokens()).toEqual(tokensOf('a')));
  });

  it('fails a call that had to restore the session first when another account signs in meanwhile', async () => {
    const first = await launch();
    await signedInAs(first, 'a');
    offline();
    const m = await launch();
    await m.auth.restore();
    online();
    const hold = deferred();
    server.gate('/auth/native/refresh', { wait: hold.wait, after: true });
    const call = m.authedApi('/me/cart', cartSchema);
    await vi.waitFor(() => expect(server.calls('/auth/native/refresh')).toHaveLength(1));
    await signedInAs(m, 'b');
    hold.resolve();

    await expect(call).rejects.toMatchObject({ status: 401 });
    expect(server.calls('/me/cart')).toHaveLength(0);
    expect(m.currentUserId()).toBe(USERS.b.id);
  });

  it('resends a call refused with a token another call has already renewed, without refreshing again', async () => {
    const m = await launch();
    await signedInAs(m, 'a');
    server.expireAccess(USERS.a.id);
    const hold = deferred();
    server.gate('/me/cart', { wait: hold.wait });
    const slow = m.authedApi('/me/cart', cartSchema);
    await expect(m.authedApi('/me/cart', cartSchema)).resolves.toBeDefined();
    expect(server.calls('/auth/native/refresh')).toHaveLength(1);
    hold.resolve();

    await expect(slow).resolves.toBeDefined();
    expect(server.calls('/auth/native/refresh')).toHaveLength(1);
    // refused, then resent: the quick call (refreshing on the way), then the slow one with the renewed token
    expect(server.calls('/me/cart').map((c) => c.userId)).toEqual([null, USERS.a.id, null, USERS.a.id]);
  });

  it('leaves the next account signed in when the API ends the previous session too late', async () => {
    const m = await launch();
    await signedInAs(m, 'a');
    server.expireAccess(USERS.a.id);
    const hold = deferred();
    server.gate('/auth/native/refresh', {
      wait: hold.wait,
      after: true,
      reply: { status: 401, body: { message: 'Session expired' } },
    });
    const call = m.authedApi('/me/cart', cartSchema);
    await vi.waitFor(() => expect(server.calls('/auth/native/refresh')).toHaveLength(1));
    await m.auth.signOut();
    await signedInAs(m, 'b');
    const kept = fakes.secure.get(REFRESH_KEY);
    hold.resolve();

    await expect(call).rejects.toMatchObject({ status: 401 });
    expect(m.currentUserId()).toBe(USERS.b.id);
    expect(fakes.secure.get(REFRESH_KEY)).toBe(kept);
  });

  it('sends nothing on return to the foreground when no session is stored', async () => {
    const m = await launch();
    expect(await m.auth.restore()).toBe(false);
    expect(await m.auth.resume()).toBe(false);
    expect(server.calls('/auth/native/refresh')).toHaveLength(0);
  });
});

describe('auth edges', () => {
  const nativeReply = (user: keyof typeof USERS) => ({
    accessToken: 'demo-access',
    expiresIn: 900,
    user: { ...USERS[user], name: 'Demo', role: 'CUSTOMER', emailVerified: true, isDemo: true },
    refreshToken: 'd'.padEnd(43, 'x'),
    refreshExpiresAt: new Date(Date.UTC(2030, 0, 1)).toISOString(),
  });

  it('tells the screens about every change of session, until they leave', async () => {
    const m = await launch();
    expect(m.useAuth()).toEqual({ status: 'restoring' });
    const notify = vi.fn();
    const leave = external.subscribe!(notify);
    await signedInAs(m, 'a');
    expect(m.useAuth()).toMatchObject({ status: 'signed-in', user: { id: USERS.a.id } });
    const seen = notify.mock.calls.length;
    expect(seen).toBeGreaterThan(0);
    leave();
    await m.auth.signOut();
    expect(notify).toHaveBeenCalledTimes(seen);
    expect(m.useAuth()).toEqual({ status: 'signed-out' });
  });

  it('signs in to a demo account with its role', async () => {
    server.gate('/auth/native/demo', { reply: { status: 200, body: nativeReply('a') } });
    const m = await launch();
    await m.auth.signInDemo('shopper');
    expect(server.calls('/auth/native/demo')[0]!.body).toEqual({ role: 'shopper' });
    expect(m.currentUserId()).toBe(USERS.a.id);
    expect(fakes.secure.get(REFRESH_KEY)).toBe('d'.padEnd(43, 'x'));
  });

  it('stays signed out after a wrong password, keeping the session stored for later', async () => {
    const first = await launch();
    await signedInAs(first, 'a');
    const stored = fakes.secure.get(REFRESH_KEY);
    const m = await launch();
    await expect(m.auth.signIn({ email: 'nobody@rakit.test', password: 'x' })).rejects.toMatchObject({
      status: 401,
    });
    expect(m.currentUserId()).toBeNull();
    expect(fakes.secure.get(REFRESH_KEY)).toBe(stored);
  });

  it('signs out on the phone even when the Keystore cannot be read or cleared, and the API not reached', async () => {
    const m = await launch();
    await signedInAs(m, 'a');
    fakes.secureReadFails = true;
    fakes.secureDeleteFails = true;
    offline();
    await expect(m.auth.signOut()).resolves.toBeUndefined();
    expect(m.useAuth()).toEqual({ status: 'signed-out' });
    online();
    expect(revokedTokens()).toEqual([]);
  });

  it('signs out without calling the API when nothing is stored', async () => {
    const m = await launch();
    await m.auth.signOut();
    expect(server.calls('/auth/native/logout')).toHaveLength(0);
    expect(m.useAuth()).toEqual({ status: 'signed-out' });
  });

  it('signs out cleanly while the API is unreachable: the stored token is still removed', async () => {
    const m = await launch();
    await signedInAs(m, 'a');
    offline();
    await m.auth.signOut();
    expect(fakes.secure.has(REFRESH_KEY)).toBe(false);
  });

  it('shows a launch whose Keystore cannot be read as signed out, keeping the token for the next try', async () => {
    const first = await launch();
    await signedInAs(first, 'a');
    fakes.secureReadFails = true;
    const m = await launch();
    expect(await m.auth.restore()).toBe(false);
    expect(m.useAuth()).toEqual({ status: 'signed-out' });
    expect(await m.auth.resume()).toBe(false);
    fakes.secureReadFails = false;
    expect(fakes.secure.has(REFRESH_KEY)).toBe(true);
    expect(await m.auth.resume()).toBe(true);
  });

  it('does not resume a session that is already signed in', async () => {
    const m = await launch();
    await signedInAs(m, 'a');
    expect(await m.auth.resume()).toBe(false);
    expect(server.calls('/auth/native/refresh')).toHaveLength(0);
  });

  it('signs in when the session stored before cannot be read, revoking nothing', async () => {
    const m = await launch();
    fakes.secure.set(REFRESH_KEY, 'old'.padEnd(43, 'x'));
    fakes.secureReadFails = true;
    await signedInAs(m, 'a');
    fakes.secureReadFails = false;
    expect(revokedTokens()).toEqual([]);
  });

  it('keeps a failed sign-in signed out without telling the screens again', async () => {
    const m = await launch();
    await m.auth.restore();
    const notify = vi.fn();
    external.subscribe!(notify);
    fakes.secureWriteFails = true;
    await expect(signedInAs(m, 'a')).rejects.toThrow('could not keep you signed in');
    expect(notify).not.toHaveBeenCalled();
  });

  it('a restore that a sign-out overtakes sends no refresh at all', async () => {
    const first = await launch();
    await signedInAs(first, 'a');
    const m = await launch();
    const restoring = m.auth.restore();
    await m.auth.signOut();
    expect(await restoring).toBe(false);
    expect(server.calls('/auth/native/refresh')).toHaveLength(0);
    expect(fakes.secure.has(REFRESH_KEY)).toBe(false);
  });

  it('a sign-in overtaken by a sign-out while another is being stored keeps neither session', async () => {
    const m = await launch();
    const entered = deferred();
    const release = deferred();
    fakes.beforeSecureWrite = () => {
      fakes.beforeSecureWrite = null;
      entered.resolve();
      return release.wait;
    };
    const a = m.auth.signIn({ email: USERS.a.email, password: 'secret-password' });
    await entered.wait;
    const b = m.auth.signIn({ email: USERS.b.email, password: 'secret-password' });
    await vi.waitFor(() => expect(server.calls('/auth/native/login')).toHaveLength(2));
    await new Promise((r) => setTimeout(r, 0));
    const out = m.auth.signOut();
    release.resolve();
    await Promise.all([a, b, out]);
    expect(m.currentUserId()).toBeNull();
    expect(fakes.secure.has(REFRESH_KEY)).toBe(false);
    await vi.waitFor(() => expect(revokedTokens()).toHaveLength(2));
  });
});
