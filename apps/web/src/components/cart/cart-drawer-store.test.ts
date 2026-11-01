import { describe, expect, it, vi } from 'vitest';
import { cartDrawer, useCartDrawerOpen } from './cart-drawer-store';

const external = vi.hoisted(() => ({
  subscribe: null as ((notify: () => void) => () => void) | null,
  server: null as (() => boolean) | null,
}));
vi.mock('react', async (actual) => ({
  ...(await actual<typeof import('react')>()),
  useSyncExternalStore: (
    subscribe: (n: () => void) => () => void,
    read: () => boolean,
    server: () => boolean,
  ) => {
    external.subscribe = subscribe;
    external.server = server;
    return read();
  },
}));

describe('cart drawer', () => {
  it('opens and closes from anywhere, telling the layout each time', () => {
    expect(useCartDrawerOpen()).toBe(false);
    const notify = vi.fn();
    const leave = external.subscribe!(notify);
    cartDrawer.open();
    expect(useCartDrawerOpen()).toBe(true);
    cartDrawer.open();
    cartDrawer.close();
    expect(useCartDrawerOpen()).toBe(false);
    expect(notify).toHaveBeenCalledTimes(3);
    leave();
    cartDrawer.open();
    expect(notify).toHaveBeenCalledTimes(3);
    cartDrawer.close();
  });

  it('is closed in a page rendered on the server', () => {
    useCartDrawerOpen();
    expect(external.server!()).toBe(false);
  });
});
