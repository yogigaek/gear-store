import { keepPreviousData, QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer, USERS, type FakeServer } from '../test/fake-api';
import { fakes, resetFakes } from '../test/fakes';

// the hooks read outside a component: useQuery hands back its options with a state the test sets, stores are read
// through their subscribe and snapshot
const stub = vi.hoisted(() => ({
  queries: [] as Record<string, any>[],
  data: new Map<string, unknown>(),
  client: null as unknown,
  subscribe: [] as ((notify: () => void) => () => void)[],
}));
vi.mock('@tanstack/react-query', async (actual) => ({
  ...(await actual<typeof import('@tanstack/react-query')>()),
  useQueryClient: () => stub.client,
  useQuery: (options: Record<string, any>) => {
    stub.queries.push(options);
    return { options, data: stub.data.get(String(options.queryKey[0])) };
  },
}));
vi.mock('react', async (actual) => ({
  ...(await actual<typeof import('react')>()),
  useSyncExternalStore: (subscribe: (n: () => void) => () => void, read: () => unknown) => {
    stub.subscribe.push(subscribe);
    return read();
  },
}));

const STORE_KEY = 'rakit:mobile-cart:v1';
let server: FakeServer;

async function launch() {
  vi.resetModules();
  const auth = await import('./auth');
  const cart = await import('./cart');
  return { ...auth, ...cart };
}
const line = (slug: string, quantity: number) => ({ slug, colorKey: '', quantity });
const query = (first: string) => stub.queries.findLast((q) => q.queryKey[0] === first)!;

beforeEach(() => {
  resetFakes();
  server = createServer();
  globalThis.fetch = ((url: string, init?: RequestInit) => server.fetch(url, init)) as typeof fetch;
  stub.queries = [];
  stub.data = new Map();
  stub.client = new QueryClient();
  stub.subscribe = [];
});

describe('useCart', () => {
  it('waits while the session is restored, counting nothing', async () => {
    const m = await launch();
    expect(m.useCart()).toEqual({ mode: 'restoring' });
    expect(m.useCartCount()).toBe(0);
  });

  it('prices the phone’s lines while signed out, counting them until the quote arrives', async () => {
    fakes.storage.set(STORE_KEY, JSON.stringify({ items: [line('folding-lock', 3)], pending: null }));
    const m = await launch();
    await m.auth.restore();
    await vi.waitFor(() => expect(m.useGuestItems()).toHaveLength(1));
    const cart = m.useCart();
    expect(cart).toMatchObject({ mode: 'guest', lineCount: 1 });
    const guest = query('cart-quote');
    expect(guest).toMatchObject({ enabled: true, placeholderData: keepPreviousData });
    expect(query('me').enabled).toBe(false);
    expect(m.useCartCount()).toBe(3);
    stub.data.set('cart-quote', { itemCount: 2 });
    expect(m.useCartCount()).toBe(2);
    expect(await guest.queryFn()).toMatchObject({ itemCount: 3 });
    expect(m.useCartActions()).toBe(m.guestActions);
  });

  it('counts nothing for an empty phone, whatever an old quote said', async () => {
    const m = await launch();
    await m.auth.restore();
    stub.data.set('cart-quote', { itemCount: 4 });
    expect(m.useCartCount()).toBe(0);
    expect(query('cart-quote').enabled).toBe(false);
  });

  it('shows the account’s cart once signed in, under that account’s key', async () => {
    const m = await launch();
    await m.auth.signIn({ email: USERS.a.email, password: 'secret-password' });
    expect(m.useCart()).toMatchObject({ mode: 'account' });
    expect(query('me')).toMatchObject({ queryKey: ['me', USERS.a.id, 'cart'], enabled: true });
    expect(m.useCartCount()).toBe(0);
    stub.data.set('me', { itemCount: 7 });
    expect(m.useCartCount()).toBe(7);
    expect(await query('me').queryFn()).toMatchObject({ itemCount: 0 });
    const actions = m.useCartActions();
    expect(actions).not.toBe(m.guestActions);
    expect(await actions.add('folding-lock', '', 1)).toBe('added');
    expect(server.carts.get(USERS.a.id)).toEqual([line('folding-lock', 1)]);
  });
});

describe('useLinesQuote', () => {
  it('prices exactly the Buy now lines, or nothing yet', async () => {
    const m = await launch();
    m.useLinesQuote(null);
    expect(query('lines-quote').enabled).toBe(false);
    // retried as other reads are: a few times, for failures that may pass
    expect([0, 3].map((n) => query('lines-quote').retry(n, new Error('offline')))).toEqual([true, false]);
    expect(await query('lines-quote').queryFn()).toMatchObject({ itemCount: 0 });
    m.useLinesQuote([line('folding-lock', 10)]);
    expect(await query('lines-quote').queryFn()).toMatchObject({ itemCount: 10 });
    expect(server.calls('/cart/quote').at(-1)!.body).toEqual({
      items: [line('folding-lock', 10)],
      builds: [],
    });
  });
});

describe('stores read by screens', () => {
  it('tells every reader about a change on the phone, until they leave', async () => {
    const m = await launch();
    await m.auth.restore();
    m.useGuestItems();
    m.usePhoneLines();
    m.useMergeNotice(USERS.a.id);
    const notify = vi.fn();
    const leave = stub.subscribe.map((s) => s(notify));
    await m.guestActions.add('folding-lock', '', 1);
    expect(notify).toHaveBeenCalled();
    expect(m.usePhoneLines()).toBe('joining');
    const seen = notify.mock.calls.length;
    leave.forEach((l) => l());
    await m.guestActions.add('folding-lock', '', 1);
    expect(notify).toHaveBeenCalledTimes(seen);
    expect(m.useMergeNotice(USERS.a.id)).toBe(0);
  });
});
