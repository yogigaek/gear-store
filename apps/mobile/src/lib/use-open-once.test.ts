import { afterEach, describe, expect, it, vi } from 'vitest';

// the hook's ref and callback stood in for, so it runs outside a component
const pushed = vi.hoisted(() => [] as unknown[]);
vi.mock('expo-router', () => ({ router: { push: (to: unknown) => pushed.push(to) } }));
vi.mock('react', async (actual) => ({
  ...(await actual<typeof import('react')>()),
  useRef: (initial: unknown) => ({ current: initial }),
  useCallback: (fn: unknown) => fn,
}));

const { useOpenOnce: openOnce } = await import('./use-open-once');

afterEach(() => {
  vi.useRealTimers();
  pushed.length = 0;
});

describe('useOpenOnce', () => {
  it('opens a screen once for a double tap, and again after 600 ms', () => {
    vi.useFakeTimers();
    const open = openOnce();
    open('/cart');
    open('/cart');
    vi.advanceTimersByTime(599);
    open('/orders');
    expect(pushed).toEqual(['/cart']);
    vi.advanceTimersByTime(1);
    open('/orders');
    expect(pushed).toEqual(['/cart', '/orders']);
  });
});
