import { afterEach, describe, expect, it, vi } from 'vitest';
import { guestCart, subtract, useGuestCart } from './guest-cart';

// the hook's store, read as React would: subscribe, then the snapshot
const external = vi.hoisted(() => ({
  subscribe: null as ((notify: () => void) => () => void) | null,
  server: null as (() => unknown) | null,
}));
vi.mock('react', async (actual) => ({
  ...(await actual<typeof import('react')>()),
  useSyncExternalStore: (
    subscribe: (n: () => void) => () => void,
    read: () => unknown,
    server: () => unknown,
  ) => {
    external.subscribe = subscribe;
    external.server = server;
    return read();
  },
}));

// node has no localStorage: give the module one for these tests
const store = new Map<string, string>();
globalThis.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  length: 0,
} as Storage;

const parts = {
  frames: 'e1-frame-m',
  batteries: 'e1-battery-625',
  shocks: 'e1-shock-air',
  forks: 'e1-fork-160',
  wheelsets: 'e1-wheelset-alloy',
  drivetrains: 'e1-drivetrain-12',
  cockpits: 'e1-cockpit-alloy',
  seats: 'e1-seat-150',
};

describe('guest cart merge', () => {
  afterEach(() => {
    guestCart.clear();
    store.clear();
  });

  it('offers a cut-off merge again, as sent and under the same key', () => {
    guestCart.set('fender-set', '', 1);
    const first = guestCart.beginMerge();
    guestCart.set('rear-rack', '', 1); // added while the reply was lost
    expect(guestCart.beginMerge()).toEqual(first);
  });

  it('keeps what was added since once the merge is confirmed, for a merge of its own', () => {
    guestCart.set('fender-set', '', 2);
    const first = guestCart.beginMerge()!;
    guestCart.set('fender-set', '', 3);
    guestCart.set('rear-rack', '', 1);
    guestCart.finishMerge(first);
    expect(guestCart.read().items).toEqual([
      { slug: 'fender-set', colorKey: '', quantity: 1 },
      { slug: 'rear-rack', colorKey: '', quantity: 1 },
    ]);
    const second = guestCart.beginMerge()!;
    expect(second.key).not.toBe(first.key);
    guestCart.finishMerge(second);
    expect(guestCart.beginMerge()).toBeNull();
  });

  it('never clears a merge another tab has started since', () => {
    guestCart.set('fender-set', '', 1);
    const first = guestCart.beginMerge()!;
    // another tab finished `first` and began the next merge
    store.set('rakit:cart:pending-merge', JSON.stringify({ key: crypto.randomUUID(), cart: first.cart }));
    const next = guestCart.beginMerge()!;
    guestCart.finishMerge(first); // this tab's late reply
    expect(guestCart.beginMerge()?.key).toBe(next.key);
  });

  it('knows a bike by its parts and colour, even when it was removed and added again', () => {
    const merged = { items: [], builds: [{ key: 'old', parts, colorKey: 'signal', quantity: 1 }] };
    const cart = { items: [], builds: [{ key: 'new', parts, colorKey: 'signal', quantity: 1 }] };
    expect(subtract(cart, merged).builds).toEqual([]);
  });

  it('takes bikes off by their key and quantity', () => {
    const cart = {
      items: [],
      builds: [
        { key: 'a', parts, colorKey: 'signal', quantity: 3 },
        { key: 'b', parts, colorKey: 'moss', quantity: 1 },
      ],
    };
    const merged = { items: [], builds: [{ key: 'a', parts, colorKey: 'signal', quantity: 1 }] };
    expect(subtract(cart, merged).builds).toEqual([
      { key: 'a', parts, colorKey: 'signal', quantity: 2 },
      { key: 'b', parts, colorKey: 'moss', quantity: 1 },
    ]);
  });
});

describe('guest cart lines', () => {
  const real = globalThis.localStorage;
  afterEach(() => {
    globalThis.localStorage = real;
    guestCart.clear();
    store.clear();
  });
  const line = (slug: string, quantity: number, colorKey = '') => ({ slug, colorKey, quantity });
  const fill = (n: number) => {
    for (let i = 0; i < n; i += 1)
      expect(guestCart.addBuild({ parts: { ...parts, seats: `seat-${i}` }, colorKey: 'signal' }, 1)).toBe(
        true,
      );
  };

  it('caps a line at 10 and removes it at 0 or below', () => {
    guestCart.set('fender-set', '', 11);
    expect(guestCart.read().items).toEqual([line('fender-set', 10)]);
    guestCart.set('fender-set', '', -1);
    expect(guestCart.read().items).toEqual([]);
    expect(store.has('rakit:cart:v2')).toBe(false);
  });

  it('keeps finishes of one part as separate lines', () => {
    guestCart.set('e1-frame-m', 'signal', 1);
    guestCart.set('e1-frame-m', 'moss', 2);
    guestCart.set('e1-frame-m', 'signal', 3);
    expect(guestCart.read().items).toEqual([line('e1-frame-m', 2, 'moss'), line('e1-frame-m', 3, 'signal')]);
  });

  it('holds five different bikes, refuses a sixth, and still adds to one it holds', () => {
    fill(5);
    expect(guestCart.addBuild({ parts: { ...parts, seats: 'other' }, colorKey: 'signal' }, 1)).toBe(false);
    expect(guestCart.read().builds).toHaveLength(5);
    // the same parts in another order are the same bike
    const reordered = Object.fromEntries(Object.entries({ ...parts, seats: 'seat-0' }).reverse());
    expect(guestCart.addBuild({ parts: reordered, colorKey: 'signal' }, 20)).toBe(true);
    expect(guestCart.read().builds[0]!.quantity).toBe(10);
  });

  it('sets a bike’s quantity by its key, capped at 10, and removes it at 0', () => {
    fill(2);
    const [a, b] = guestCart.read().builds;
    guestCart.setBuild(a!.key, 99);
    guestCart.setBuild('unknown', 3);
    expect(guestCart.read().builds.map((x) => x.quantity)).toEqual([10, 1]);
    guestCart.setBuild(b!.key, 0);
    expect(guestCart.read().builds.map((x) => x.key)).toEqual([a!.key]);
  });

  it('reads a stored cart that is not JSON, or not a cart, as empty', async () => {
    for (const raw of [
      '{',
      '"cart"',
      JSON.stringify({ items: [line('Bad Slug', 1)] }),
      JSON.stringify({ items: [line('a', 11)] }),
    ]) {
      vi.resetModules();
      store.set('rakit:cart:v2', raw);
      const { guestCart: fresh } = await import('./guest-cart');
      expect(fresh.read(), raw).toEqual({ items: [], builds: [] });
    }
  });

  it('keeps working for the visit when storage is blocked', async () => {
    const refuse = () => {
      throw new DOMException('blocked', 'SecurityError');
    };
    globalThis.localStorage = { getItem: refuse, setItem: refuse, removeItem: refuse } as unknown as Storage;
    vi.resetModules();
    const { guestCart: fresh } = await import('./guest-cart');
    expect(fresh.read()).toEqual({ items: [], builds: [] });
    fresh.set('fender-set', '', 2);
    expect(fresh.read().items).toEqual([line('fender-set', 2)]);
    const job = fresh.beginMerge()!;
    expect(job.cart.items).toEqual([line('fender-set', 2)]);
    // not resumable after a reload, but still finished on this page
    fresh.finishMerge(job);
    expect(fresh.read().items).toEqual([]);
    fresh.abandonMerge(job);
  });

  it('tells its readers about every change, and stops once they leave', () => {
    useGuestCart();
    const notify = vi.fn();
    const leave = external.subscribe!(notify);
    guestCart.set('fender-set', '', 1);
    expect(notify).toHaveBeenCalledTimes(1);
    leave();
    guestCart.set('fender-set', '', 2);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(external.server!()).toEqual({ items: [], builds: [] });
  });

  it('rereads the cart another tab changed, and ignores other keys', async () => {
    let onStorage: ((e: { key: string | null }) => void) | undefined;
    vi.stubGlobal('window', { addEventListener: (_: string, l: typeof onStorage) => (onStorage = l) });
    vi.resetModules();
    const fresh = await import('./guest-cart');
    expect(fresh.guestCart.read().items).toEqual([]);
    fresh.useGuestCart();
    const notify = vi.fn();
    external.subscribe!(notify);
    store.set('rakit:cart:v2', JSON.stringify({ items: [line('rear-rack', 4)], builds: [] }));
    onStorage!({ key: 'rakit:other' });
    expect(notify).not.toHaveBeenCalled();
    expect(fresh.guestCart.read().items).toEqual([]);
    onStorage!({ key: 'rakit:cart:v2' });
    expect(notify).toHaveBeenCalledOnce();
    expect(fresh.guestCart.read().items).toEqual([line('rear-rack', 4)]);
    vi.unstubAllGlobals();
  });
});

describe('guest cart merge edges', () => {
  afterEach(() => {
    guestCart.clear();
    store.clear();
  });

  it('has nothing to merge from an empty cart', () => {
    expect(guestCart.beginMerge()).toBeNull();
    expect(store.has('rakit:cart:pending-merge')).toBe(false);
  });

  it.each([
    ['not JSON', '{'],
    ['a key that is not a UUID', JSON.stringify({ key: 'merge-1', cart: { items: [] } })],
    ['no cart', JSON.stringify({ key: crypto.randomUUID() })],
    ['a cart that is not one', JSON.stringify({ key: crypto.randomUUID(), cart: { items: 'x' } })],
  ])('starts a fresh merge over a stored one with %s', (_, raw) => {
    guestCart.set('fender-set', '', 1);
    store.set('rakit:cart:pending-merge', raw);
    const job = guestCart.beginMerge()!;
    expect(job.cart.items).toEqual([{ slug: 'fender-set', colorKey: '', quantity: 1 }]);
    expect(JSON.parse(store.get('rakit:cart:pending-merge')!).key).toBe(job.key);
  });

  it('gives two tabs that start a merge together the same key, so the API adds it once', async () => {
    guestCart.set('fender-set', '', 1);
    const first = guestCart.beginMerge()!;
    vi.resetModules();
    const { guestCart: otherTab } = await import('./guest-cart');
    expect(otherTab.beginMerge()).toEqual(first);
  });

  it('drops a refused merge, keeping the cart for a fresh one, but never another tab’s merge', () => {
    guestCart.set('fender-set', '', 1);
    const refused = guestCart.beginMerge()!;
    guestCart.abandonMerge(refused);
    expect(store.has('rakit:cart:pending-merge')).toBe(false);
    expect(guestCart.read().items).toHaveLength(1);
    const next = guestCart.beginMerge()!;
    expect(next.key).not.toBe(refused.key);
    guestCart.abandonMerge(refused);
    expect(guestCart.beginMerge()!.key).toBe(next.key);
  });

  it('takes off no more than the cart holds, part by part', () => {
    const cart = {
      items: [
        { slug: 'fender-set', colorKey: '', quantity: 1 },
        { slug: 'e1-frame-m', colorKey: 'moss', quantity: 2 },
      ],
      builds: [],
    };
    const merged = {
      items: [
        { slug: 'fender-set', colorKey: '', quantity: 3 },
        { slug: 'e1-frame-m', colorKey: 'signal', quantity: 2 },
      ],
      builds: [],
    };
    expect(subtract(cart, merged).items).toEqual([{ slug: 'e1-frame-m', colorKey: 'moss', quantity: 2 }]);
  });

  it('spreads one merged bike over two copies of it in the cart', () => {
    const copy = (key: string, quantity: number) => ({ key, parts, colorKey: 'signal', quantity });
    const cart = { items: [], builds: [copy('a', 2), copy('b', 2)] };
    const merged = { items: [], builds: [copy('x', 3)] };
    expect(subtract(cart, merged).builds).toEqual([copy('b', 1)]);
  });
});
