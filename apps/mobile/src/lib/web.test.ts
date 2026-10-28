import { describe, expect, it, vi } from 'vitest';

const opened = vi.hoisted(() => [] as string[]);
vi.mock('expo-web-browser', () => ({
  openBrowserAsync: (url: string) => {
    opened.push(url);
    return Promise.resolve({ type: 'opened' });
  },
}));

const { afterSignIn, openWeb, WEB_URL } = await import('./web');

describe('afterSignIn', () => {
  it('carries a sign-in started from the cart on to checkout', () => {
    expect(afterSignIn({ next: 'checkout' })).toBe('/checkout');
  });

  it('carries a Buy now on to checkout with that one part', () => {
    expect(afterSignIn({ next: 'checkout', buy: 'e1-frame-m', finish: 'signal', qty: '1' })).toEqual({
      pathname: '/checkout',
      params: { buy: 'e1-frame-m', finish: 'signal', qty: '1' },
    });
    expect(afterSignIn({ next: 'checkout', buy: 'folding-lock', qty: '1' })).toEqual({
      pathname: '/checkout',
      params: { buy: 'folding-lock', qty: '1' },
    });
  });

  it('drops buy params that do not read as one line, keeping only checkout', () => {
    for (const bad of [
      { buy: 'https://example.com' },
      { buy: 'folding-lock', qty: '50' },
      { buy: 'folding-lock', finish: '<script>' },
      { buy: ['folding-lock', 'rear-rack'] },
    ]) {
      expect(afterSignIn({ next: 'checkout', ...bad })).toBe('/checkout');
    }
  });

  it('brings a sign-in started from the orders list back to it', () => {
    expect(afterSignIn({ next: 'orders' })).toBe('/orders');
  });

  it('brings a sign-in started from an order back to that order', () => {
    expect(afterSignIn({ next: 'order', number: 'RKT-261027-AB2C3D' })).toEqual({
      pathname: '/orders/[number]',
      params: { number: 'RKT-261027-AB2C3D' },
    });
  });

  it('ignores an order number that does not read as one', () => {
    for (const number of [
      undefined,
      '',
      'rkt-261027-ab2c3d',
      'RKT-261027-AB2C3D/../../checkout',
      'https://example.com',
      ['RKT-261027-AB2C3D'],
    ]) {
      expect(afterSignIn({ next: 'order', number })).toBeNull();
    }
  });

  it('ignores anything else, so a link cannot send a new session somewhere unexpected', () => {
    for (const next of [
      undefined,
      '',
      '/checkout',
      '/orders',
      'Orders',
      'https://example.com',
      ['checkout'],
    ]) {
      expect(afterSignIn({ next })).toBeNull();
      expect(afterSignIn({ next, buy: 'folding-lock', qty: '1' })).toBeNull();
    }
  });
});

describe('openWeb', () => {
  it('opens a page of the Rakit website', async () => {
    await openWeb('/admin');
    expect(opened.at(-1)).toBe(`${WEB_URL}/admin`);
    expect(WEB_URL).toBe('https://yogi-store.vercel.app');
  });
});
