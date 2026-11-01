import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();
const storage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => store.set(k, v),
  removeItem: (k: string) => store.delete(k),
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() {
    return store.size;
  },
};
const refuse = () => {
  throw new Error('blocked');
};

// a fresh module per test: its in-memory fallback starts empty, as on a page load
async function load() {
  vi.resetModules();
  return import('./checkout-key');
}

beforeEach(() => {
  store.clear();
  vi.stubGlobal('sessionStorage', storage);
});

describe('checkoutKey', () => {
  it('keeps one key per scope until the attempt is closed, across reloads of the page', async () => {
    const k = await load();
    const cart = k.checkoutKey('cart:a');
    expect(k.checkoutKey('cart:a')).toBe(cart);
    expect(k.checkoutKey('buy:fender-set::1')).not.toBe(cart);
    expect((await load()).checkoutKey('cart:a')).toBe(cart);

    k.closeCheckoutKey('cart:a');
    expect(k.hasOpenCheckoutKey('cart:a')).toBe(false);
    expect(k.checkoutKey('cart:a')).not.toBe(cart);
  });

  it('lets an attempt given up long ago go: its key is not resent', async () => {
    const k = await load();
    const at = 1_000_000;
    const old = k.checkoutKey('cart:a', at);
    expect(k.checkoutKey('cart:a', at + k.CHECKOUT_KEY_TTL_MS - 1)).toBe(old);
    expect(k.hasOpenCheckoutKey('cart:a', at + k.CHECKOUT_KEY_TTL_MS)).toBe(false);
    expect(k.checkoutKey('cart:a', at + k.CHECKOUT_KEY_TTL_MS)).not.toBe(old);
  });

  it('keeps the key for the page when storage is refused, so a retry on the page is the same order', async () => {
    vi.stubGlobal('sessionStorage', {
      getItem: refuse,
      setItem: refuse,
      removeItem: refuse,
      key: refuse,
      length: 1,
    });
    const k = await load();
    const first = k.checkoutKey('buy:fender-set::1');
    expect(k.checkoutKey('buy:fender-set::1')).toBe(first);
    expect(k.hasOpenCheckoutKey('buy:fender-set::1')).toBe(true);
    k.closeCheckoutKey('buy:fender-set::1');
    expect(k.checkoutKey('buy:fender-set::1')).not.toBe(first);
  });
});

describe('closeCheckoutKeysBefore', () => {
  it('settles the attempts an orders list read after them shows, so a new Buy now is a new order', async () => {
    const k = await load();
    const buy = k.checkoutKey('buy:fender-set::1', 1_000);
    k.checkoutKey('cart:fender-set::1', 1_000);

    const readAt = 1_000 + k.SETTLE_MARGIN_MS + 1;
    k.closeCheckoutKeysBefore(readAt);
    expect(k.hasOpenCartAttempt(readAt)).toBe(false);
    expect(k.checkoutKey('buy:fender-set::1', readAt)).not.toBe(buy);
  });

  it('leaves a recent attempt open: the API may still be making its order while the list is read', async () => {
    const k = await load();
    const buy = k.checkoutKey('buy:fender-set::1', 10_000);
    k.closeCheckoutKeysBefore(10_000 + k.SETTLE_MARGIN_MS - 1);
    expect(k.checkoutKey('buy:fender-set::1', 10_000 + k.SETTLE_MARGIN_MS)).toBe(buy);
  });

  it('leaves an attempt opened after the list was read: that list cannot show its order', async () => {
    const k = await load();
    const buy = k.checkoutKey('buy:fender-set::1', 5_000);
    k.closeCheckoutKeysBefore(4_000);
    expect(k.checkoutKey('buy:fender-set::1', 5_001)).toBe(buy);
  });
});

describe('cartScope', () => {
  it('names the cart by what it holds, in any order', async () => {
    const { cartScope } = await load();
    const a = cartScope(
      [
        { slug: 'fender-set', colorKey: '', quantity: 1 },
        { slug: 'e1-frame-m', colorKey: 'moss', quantity: 2 },
      ],
      [{ id: 'b1', quantity: 1 }],
    );
    const reordered = cartScope(
      [
        { slug: 'e1-frame-m', colorKey: 'moss', quantity: 2 },
        { slug: 'fender-set', colorKey: '', quantity: 1 },
      ],
      [{ id: 'b1', quantity: 1 }],
    );
    expect(reordered).toBe(a);
    expect(cartScope([{ slug: 'fender-set', colorKey: '', quantity: 2 }], [])).not.toBe(
      cartScope([{ slug: 'fender-set', colorKey: '', quantity: 1 }], []),
    );
  });
});

describe('checkout key edges', () => {
  it('opens a new attempt over a stored record it cannot read', async () => {
    const k = await load();
    for (const raw of ['{', 'null', '{"key":1,"at":1}', '{"key":"k"}', '{"key":"k","at":"1"}']) {
      store.set('rakit:checkout-key:cart:a', raw);
      expect(k.hasOpenCheckoutKey('cart:a'), raw).toBe(false);
      expect(k.checkoutKey('cart:a')).not.toBe('k');
    }
  });

  it('keeps scopes apart: a Buy now attempt is not an open cart attempt', async () => {
    const k = await load();
    k.checkoutKey('buy:fender-set::1', 1_000);
    store.set('rakit:other', 'x');
    expect(k.hasOpenCartAttempt(1_000)).toBe(false);
    k.checkoutKey('cart:fender-set::1', 1_000);
    expect(k.hasOpenCartAttempt(1_000)).toBe(true);
    expect(k.hasOpenCartAttempt(1_000 + k.CHECKOUT_KEY_TTL_MS)).toBe(false);
  });

  it('settles at exactly the margin before the read, not a millisecond later', async () => {
    const k = await load();
    const key = k.checkoutKey('cart:a', 10_000);
    k.closeCheckoutKeysBefore(10_000 + k.SETTLE_MARGIN_MS);
    expect(k.checkoutKey('cart:a', 10_001)).toBe(key);
    k.closeCheckoutKeysBefore(10_001 + k.SETTLE_MARGIN_MS);
    expect(k.hasOpenCheckoutKey('cart:a', 10_001)).toBe(false);
  });

  it('settles what it cannot read, and leaves other site data alone', async () => {
    const k = await load();
    store.set('rakit:checkout-key:cart:broken', '{');
    store.set('rakit:cart:v2', 'kept');
    k.closeCheckoutKeysBefore(0);
    expect(store.has('rakit:checkout-key:cart:broken')).toBe(false);
    expect(store.get('rakit:cart:v2')).toBe('kept');
  });

  it('settles the page’s own keys when storage is refused', async () => {
    vi.stubGlobal('sessionStorage', {
      getItem: refuse,
      setItem: refuse,
      removeItem: refuse,
      key: refuse,
      get length() {
        return refuse();
      },
    });
    const k = await load();
    const key = k.checkoutKey('cart:a', 1_000);
    expect(k.hasOpenCartAttempt(1_000)).toBe(true);
    k.closeCheckoutKeysBefore(1_000 + k.SETTLE_MARGIN_MS + 1);
    expect(k.hasOpenCartAttempt(1_000)).toBe(false);
    expect(k.checkoutKey('cart:a', 1_000)).not.toBe(key);
  });

  it('names carts that differ by finish, by bike or by a bike’s count differently', async () => {
    const { cartScope } = await load();
    const line = (colorKey: string) => [{ slug: 'e1-frame-m', colorKey, quantity: 1 }];
    expect(cartScope(line('moss'), [])).not.toBe(cartScope(line('signal'), []));
    expect(cartScope([], [{ id: 'b1', quantity: 1 }])).not.toBe(cartScope([], [{ id: 'b1', quantity: 2 }]));
    expect(cartScope([], [])).toBe('cart:');
  });
});
