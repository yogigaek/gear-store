import { beforeEach, describe, expect, it, vi } from 'vitest';

let keys: number;
const create = () => `key-${++keys}`;

async function load() {
  vi.resetModules();
  return import('./checkout-key');
}

beforeEach(() => {
  keys = 0;
});

const lock = { slug: 'folding-lock', colorKey: '', quantity: 1 };

describe('checkout key', () => {
  it('stays the same for the same account until the attempt is closed, across visits to checkout', async () => {
    const m = await load();
    expect(m.hasOpenCheckout('a', 'cart')).toBe(false);
    const first = m.checkoutKey('a', 'cart', create);
    expect(m.checkoutKey('a', 'cart', create)).toBe(first);
    expect(m.hasOpenCheckout('a', 'cart')).toBe(true);
  });

  it('starts over once an order came back, or a refusal said nothing was placed', async () => {
    const m = await load();
    const first = m.checkoutKey('a', 'cart', create);
    m.closeCheckout(first);
    expect(m.hasOpenCheckout('a', 'cart')).toBe(false);
    expect(m.checkoutKey('a', 'cart', create)).not.toBe(first);
  });

  it('starts over for another account, and ignores closing a key that is no longer open', async () => {
    const m = await load();
    const forA = m.checkoutKey('a', 'cart', create);
    const forB = m.checkoutKey('b', 'cart', create);
    expect(forB).not.toBe(forA);
    expect(m.hasOpenCheckout('a', 'cart')).toBe(false);
    m.closeCheckout(forA);
    expect(m.checkoutKey('b', 'cart', create)).toBe(forB);
  });
});

describe('checkout scope', () => {
  it('never hands a Buy-now key to the cart, or the cart key to a Buy-now', async () => {
    const m = await load();
    expect(m.checkoutScope()).toBe('cart');
    const buy = m.checkoutKey('a', m.checkoutScope(lock), create);
    expect(m.hasOpenCheckout('a', 'cart')).toBe(false);
    const cart = m.checkoutKey('a', 'cart', create);
    expect(cart).not.toBe(buy);
    expect(m.checkoutKey('a', m.checkoutScope(lock), create)).toBe(buy);
  });

  it('gives another part, finish or quantity its own key', async () => {
    const m = await load();
    const buy = m.checkoutKey('a', m.checkoutScope(lock), create);
    for (const other of [
      { ...lock, slug: 'rear-rack' },
      { ...lock, colorKey: 'signal' },
      { ...lock, quantity: 2 },
    ]) {
      expect(m.checkoutKey('a', m.checkoutScope(other), create)).not.toBe(buy);
    }
  });

  it('closes only the attempt whose order came back', async () => {
    const m = await load();
    const buy = m.checkoutKey('a', m.checkoutScope(lock), create);
    const cart = m.checkoutKey('a', 'cart', create);
    m.closeCheckout(buy);
    expect(m.hasOpenCheckout('a', m.checkoutScope(lock))).toBe(false);
    expect(m.hasOpenCheckout('a', 'cart')).toBe(true);
    expect(m.checkoutKey('a', 'cart', create)).toBe(cart);
  });
});
