import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cart, cartLine } from '../test/fixtures';
import { auth, call, fakeApi, fetchQuery, hooks, query, resetHooks } from '../test/query-hooks';
import { useCart, useLinesQuote } from './cart';
import { guestCart } from './guest-cart';

vi.mock('@tanstack/react-query', async (actual) =>
  (await import('../test/query-hooks')).mockReactQuery(
    await actual<typeof import('@tanstack/react-query')>(),
  ),
);
vi.mock('./auth-context', async () => {
  const { auth } = await import('../test/query-hooks');
  return { useAuth: () => auth };
});
vi.mock('react', async (actual) => ({
  ...(await actual<typeof import('react')>()),
  useSyncExternalStore: (_subscribe: unknown, read: () => unknown) => read(),
}));

const store = new Map<string, string>();
const parts = { frames: 'e1-frame-m', forks: 'e1-fork-160' };
const SERVER = ['me', 'cart'];

beforeEach(() => {
  resetHooks();
  store.clear();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  guestCart.clear();
});
afterEach(() => vi.unstubAllGlobals());

describe('useCart as a guest', () => {
  beforeEach(() => {
    auth.status = 'signed-out';
  });

  it('is empty, asks nothing and is not loading while the browser holds nothing', () => {
    const c = call(useCart);
    expect(c.cart).toEqual(cart());
    expect(c.isLoading).toBe(false);
    expect(query('me', 'cart').enabled).toBe(false);
    expect(query('cart', 'guest').enabled).toBe(false);
  });

  it('prices what the browser holds, keeping the last price while the next loads', async () => {
    guestCart.set('fender-set', '', 2);
    hooks.state = (o) => (o.queryKey[0] === 'cart' ? { data: cart({ itemCount: 2 }), isPending: false } : {});
    const c = call(useCart);
    expect(c.cart).toMatchObject({ itemCount: 2 });
    const q = query('cart', 'guest');
    expect(q.enabled).toBe(true);
    expect(q.placeholderData('previous')).toBe('previous');
    const sent = fakeApi({ 'POST /cart/quote': () => cart() });
    await fetchQuery(q);
    expect(sent[0]).toMatchObject({
      body: { items: [{ slug: 'fender-set', colorKey: '', quantity: 2 }], builds: [] },
    });
    expect(sent[0]!.auth).toBeUndefined();
  });

  it('keeps changes in the browser, adding to a line up to 10', async () => {
    hooks.state = () => ({ data: cart({ items: [cartLine('fender-set', 8)] }) });
    guestCart.set('fender-set', '', 8);
    const c = call(useCart);
    await c.add('fender-set', '', 5);
    expect(guestCart.read().items).toEqual([{ slug: 'fender-set', colorKey: '', quantity: 10 }]);
    await c.setQuantity('fender-set', '', 0);
    expect(guestCart.read().items).toEqual([]);
  });

  it('adds a line not in the priced cart yet from zero', async () => {
    const c = call(useCart);
    await c.add('rear-rack', '', 3);
    expect(guestCart.read().items).toEqual([{ slug: 'rear-rack', colorKey: '', quantity: 3 }]);
  });

  it('holds up to five different bikes, and says so at the sixth', async () => {
    const c = call(useCart);
    for (const colorKey of ['a', 'b', 'c', 'd', 'e']) await c.addBuild({ parts, colorKey }, 1);
    await c.addBuild({ parts, colorKey: 'a' }, 1);
    await expect(c.addBuild({ parts, colorKey: 'f' }, 1)).rejects.toThrow(
      'A cart holds up to 5 different bikes',
    );
    const [first] = guestCart.read().builds;
    expect(first!.quantity).toBe(2);
    await c.setBuildQuantity(first!.key, 0);
    expect(guestCart.read().builds).toHaveLength(4);
  });
});

describe('useCart signed in', () => {
  it('waits while the session is being restored', () => {
    auth.status = 'restoring';
    guestCart.set('fender-set', '', 1);
    const c = call(useCart);
    expect(c.isLoading).toBe(true);
    expect(query('me', 'cart').enabled).toBe(false);
    expect(query('cart', 'guest').enabled).toBe(false);
  });

  it('shows the account’s cart, never the browser’s', async () => {
    guestCart.set('fender-set', '', 1);
    hooks.state = (o) =>
      o.queryKey[0] === 'me'
        ? { data: cart({ itemCount: 7 }), isPending: false }
        : { data: cart({ itemCount: 1 }) };
    const c = call(useCart);
    expect(c.cart).toMatchObject({ itemCount: 7 });
    expect(c.isLoading).toBe(false);
    const sent = fakeApi({ 'GET /me/cart': () => cart() });
    await fetchQuery(query('me', 'cart'));
    expect(sent[0]!.auth).toBe('Bearer t');
  });

  it('sends each change to the account and shows the cart it sends back', async () => {
    hooks.state = () => ({ data: cart({ items: [cartLine('fender-set', 9)] }) });
    const sent = fakeApi({
      'PUT /me/cart/items': () => cart({ itemCount: 10 }),
      'POST /me/cart/builds': () => cart({ itemCount: 11 }),
      'PUT /me/cart/builds/b1': () => cart({ itemCount: 12 }),
    });
    const c = call(useCart);
    await c.add('fender-set', '', 5);
    expect(hooks.client.getQueryData(SERVER)).toMatchObject({ itemCount: 10 });
    await c.addBuild({ parts, colorKey: 'signal' }, 2);
    await c.setBuildQuantity('b1', 3);
    expect(sent.map((s) => [s.method, s.path, s.body])).toEqual([
      ['PUT', '/me/cart/items', { slug: 'fender-set', colorKey: '', quantity: 10 }],
      ['POST', '/me/cart/builds', { parts, colorKey: 'signal', quantity: 2 }],
      ['PUT', '/me/cart/builds/b1', { quantity: 3 }],
    ]);
    expect(hooks.client.getQueryData(SERVER)).toMatchObject({ itemCount: 12 });
    expect(guestCart.read()).toEqual({ items: [], builds: [] });
  });

  it('passes on a refused bike with the API’s reason', async () => {
    fakeApi({
      'POST /me/cart/builds': () =>
        new Response(JSON.stringify({ message: 'That fork does not fit this frame' }), { status: 400 }),
    });
    await expect(call(useCart).addBuild({ parts, colorKey: 'signal' }, 1)).rejects.toMatchObject({
      message: 'That fork does not fit this frame',
    });
  });

  it('reports the cart’s own error first, then a change that failed', () => {
    const readError = new Error('read');
    hooks.state = (o) => (o.queryKey[0] === 'me' ? { error: readError } : { error: null });
    expect(call(useCart).error).toBe(readError);
    hooks.state = () => ({ error: null });
    const c = call(useCart);
    expect(c.error).toBeNull();
    expect(c.isUpdating).toBeFalsy();
  });
});

describe('useLinesQuote', () => {
  it('prices nothing without lines, and exactly the lines it is given', async () => {
    call(useLinesQuote, null);
    expect(query('cart', 'lines').enabled).toBe(false);
    const lines = [{ slug: 'fender-set', colorKey: '', quantity: 10 }];
    const sent = fakeApi({ 'POST /cart/quote': () => cart() });
    call(useLinesQuote, lines);
    const q = query('cart', 'lines', lines);
    expect(q.enabled).toBe(true);
    await fetchQuery(q);
    expect(sent[0]!.body).toEqual({ items: lines, builds: [] });
  });

  it('sends an empty list if asked to price before lines exist', async () => {
    const sent = fakeApi({ 'POST /cart/quote': () => cart() });
    call(useLinesQuote, null);
    await fetchQuery(query('cart', 'lines'));
    expect(sent[0]!.body).toEqual({ items: [], builds: [] });
  });
});
