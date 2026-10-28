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
  it('carries a sign-in started by "Buy now" on to checkout', () => {
    expect(afterSignIn('checkout')).toBe('/checkout');
  });

  it('ignores anything else, so a link cannot send a new session somewhere unexpected', () => {
    for (const next of [undefined, '', '/checkout', 'orders', 'https://example.com', ['checkout']]) {
      expect(afterSignIn(next)).toBeNull();
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
