import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cartScope,
  CHECKOUT_KEY_TTL_MS,
  checkoutKey,
  closeCheckoutKey,
  hasOpenCartAttempt,
  hasOpenCheckoutKey,
} from './checkout-key';

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

beforeEach(() => {
  store.clear();
  vi.stubGlobal('sessionStorage', storage);
});

describe('checkoutKey', () => {
  it('keeps one key per scope until the attempt is closed, across reloads of the page', () => {
    const cart = checkoutKey('cart:a');
    expect(checkoutKey('cart:a')).toBe(cart);
    expect(checkoutKey('buy:fender-set::1')).not.toBe(cart);
    expect(hasOpenCheckoutKey('cart:a')).toBe(true);

    closeCheckoutKey('cart:a');
    expect(hasOpenCheckoutKey('cart:a')).toBe(false);
    expect(checkoutKey('cart:a')).not.toBe(cart);
  });

  it('lets an attempt given up long ago go: its key is not resent', () => {
    const at = 1_000_000;
    const old = checkoutKey('cart:a', at);
    expect(checkoutKey('cart:a', at + CHECKOUT_KEY_TTL_MS - 1)).toBe(old);
    expect(hasOpenCheckoutKey('cart:a', at + CHECKOUT_KEY_TTL_MS)).toBe(false);
    expect(checkoutKey('cart:a', at + CHECKOUT_KEY_TTL_MS)).not.toBe(old);
  });

  it('still gives a key when storage is refused', () => {
    const refuse = () => {
      throw new Error('blocked');
    };
    vi.stubGlobal('sessionStorage', {
      getItem: refuse,
      setItem: refuse,
      removeItem: refuse,
      key: refuse,
      length: 1,
    });
    expect(checkoutKey('cart:a')).toMatch(/^[0-9a-f-]{36}$/);
    expect(hasOpenCheckoutKey('cart:a')).toBe(false);
    expect(hasOpenCartAttempt()).toBe(false);
    expect(() => closeCheckoutKey('cart:a')).not.toThrow();
  });
});

describe('cartScope', () => {
  it('names the cart by what it holds, in any order, so a cart filled again is a new attempt', () => {
    const a = cartScope(
      [
        { slug: 'fender-set', colorKey: '', quantity: 1 },
        { slug: 'e1-frame-m', colorKey: 'moss', quantity: 2 },
      ],
      [{ id: 'b1', quantity: 1 }],
    );
    const sameReordered = cartScope(
      [
        { slug: 'e1-frame-m', colorKey: 'moss', quantity: 2 },
        { slug: 'fender-set', colorKey: '', quantity: 1 },
      ],
      [{ id: 'b1', quantity: 1 }],
    );
    expect(sameReordered).toBe(a);
    expect(cartScope([{ slug: 'fender-set', colorKey: '', quantity: 2 }], [])).not.toBe(
      cartScope([{ slug: 'fender-set', colorKey: '', quantity: 1 }], []),
    );
  });

  it('finds an open cart attempt whatever the cart held', () => {
    expect(hasOpenCartAttempt()).toBe(false);
    checkoutKey('buy:fender-set::1');
    expect(hasOpenCartAttempt()).toBe(false);
    checkoutKey(cartScope([{ slug: 'fender-set', colorKey: '', quantity: 1 }], []));
    expect(hasOpenCartAttempt()).toBe(true);
  });
});
