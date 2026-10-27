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

describe('checkout key', () => {
  it('stays the same for the same account until the attempt is closed, across visits to checkout', async () => {
    const m = await load();
    expect(m.hasOpenCheckout('a')).toBe(false);
    const first = m.checkoutKey('a', create);
    expect(m.checkoutKey('a', create)).toBe(first);
    expect(m.hasOpenCheckout('a')).toBe(true);
  });

  it('starts over once an order came back, or a refusal said nothing was placed', async () => {
    const m = await load();
    const first = m.checkoutKey('a', create);
    m.closeCheckout(first);
    expect(m.hasOpenCheckout('a')).toBe(false);
    expect(m.checkoutKey('a', create)).not.toBe(first);
  });

  it('starts over for another account, and ignores closing a key that is no longer open', async () => {
    const m = await load();
    const forA = m.checkoutKey('a', create);
    const forB = m.checkoutKey('b', create);
    expect(forB).not.toBe(forA);
    expect(m.hasOpenCheckout('a')).toBe(false);
    m.closeCheckout(forA);
    expect(m.checkoutKey('b', create)).toBe(forB);
  });
});
