import { cartSchema, type CartLineInput } from '@gear-store/shared';
import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer, deferred, USERS, type FakeServer } from '../test/fake-api';
import { fakes, resetFakes } from '../test/fakes';

const STORE_KEY = 'rakit:mobile-cart:v1';
let server: FakeServer;

/** a fresh app: module state starts over, storage keeps what the last run left */
async function launch() {
  vi.resetModules();
  const auth = await import('./auth');
  const cart = await import('./cart');
  return { ...auth, ...cart, queryClient: new QueryClient() };
}
type App = Awaited<ReturnType<typeof launch>>;

const line = (slug: string, quantity: number, colorKey = ''): CartLineInput => ({ slug, colorKey, quantity });
const stored = (): {
  items: CartLineInput[];
  pending: { key: string; cart: { items: CartLineInput[] } } | null;
} | null => (fakes.storage.has(STORE_KEY) ? JSON.parse(fakes.storage.get(STORE_KEY)!) : null);
const onPhone = (items: CartLineInput[], pending: unknown = null) =>
  fakes.storage.set(STORE_KEY, JSON.stringify({ items, pending }));
const signIn = (m: App, user: keyof typeof USERS) =>
  m.auth.signIn({ email: USERS[user].email, password: 'secret-password' });
const mergeKeysSent = () =>
  new Set(server.calls('/me/cart/merge').map((c) => (c.body as { mergeKey: string }).mergeKey));
const never = () => new Promise<void>(() => undefined);
const fill = (count: number, quantity = 1) =>
  Array.from({ length: count }, (_, i) => line(`part-${i}`, quantity));

beforeEach(() => {
  resetFakes();
  server = createServer();
  globalThis.fetch = ((url: string, init?: RequestInit) => server.fetch(url, init)) as typeof fetch;
});

describe('mergeInto', () => {
  // Each "kill" parks the first run on a promise that never settles, exactly at that point; a second run (a
  // relaunch, with what storage holds) then finishes the job.
  const kills: Record<string, { at: () => void; reached: () => void }> = {
    'after the merge was stored, before it was sent': {
      at: () => (fakes.afterStorageWrite = () => (stored()?.pending ? never() : undefined)),
      reached: () => expect(stored()?.pending).toBeTruthy(),
    },
    'after the API applied it, before the reply': {
      at: () => server.gate('/me/cart/merge', { wait: never(), after: true }),
      reached: () => expect(server.calls('/me/cart/merge')).toHaveLength(1),
    },
    'after the reply, before the phone dropped its lines': {
      at: () =>
        (fakes.beforeStorageWrite = () => (server.calls('/me/cart/merge').length > 0 ? never() : undefined)),
      reached: () => expect(server.calls('/me/cart/merge')).toHaveLength(1),
    },
  };

  it.each(Object.keys(kills))('merges once when the app is killed %s', async (point) => {
    onPhone([line('folding-lock', 2), line('e1-frame-m', 1, 'ember')]);
    const first = await launch();
    await signIn(first, 'a');
    kills[point]!.at();
    void first.mergeInto(first.queryClient, USERS.a.id);
    await vi.waitFor(kills[point]!.reached);
    fakes.beforeStorageWrite = null;
    fakes.afterStorageWrite = null;

    const next = await launch();
    await next.auth.restore();
    await next.mergeInto(next.queryClient, USERS.a.id);
    expect(server.carts.get(USERS.a.id)).toEqual([line('folding-lock', 2), line('e1-frame-m', 1, 'ember')]);
    expect(mergeKeysSent().size).toBe(1);
    expect(stored()).toBeNull();
  });

  it('drops the attempt but keeps the lines when the API refuses it (400)', async () => {
    onPhone([line('folding-lock', 2)]);
    const m = await launch();
    await signIn(m, 'a');
    server.gate('/me/cart/merge', { reply: { status: 400, body: { message: 'Bad cart' } } });
    await expect(m.mergeInto(m.queryClient, USERS.a.id)).rejects.toMatchObject({ status: 400 });
    expect(stored()).toEqual({ items: [line('folding-lock', 2)], pending: null });
  });

  it('keeps the attempt, key and all, after any other failure, and sends it again next time', async () => {
    onPhone([line('folding-lock', 2)]);
    const m = await launch();
    await signIn(m, 'a');
    server.gate('/me/cart/merge', { reply: { status: 503, body: {} } });
    await expect(m.mergeInto(m.queryClient, USERS.a.id)).rejects.toMatchObject({ status: 503 });
    const key = stored()!.pending!.key;

    await m.mergeInto(m.queryClient, USERS.a.id);
    expect([...mergeKeysSent()]).toEqual([key]);
    expect(server.carts.get(USERS.a.id)).toEqual([line('folding-lock', 2)]);
    expect(stored()).toBeNull();
  });

  it('does not send a merge it could not store', async () => {
    onPhone([line('folding-lock', 2)]);
    const m = await launch();
    await signIn(m, 'a');
    fakes.beforeStorageWrite = () => {
      throw new Error('disk full');
    };
    await expect(m.mergeInto(m.queryClient, USERS.a.id)).rejects.toThrow();
    expect(server.calls('/me/cart/merge')).toHaveLength(0);

    fakes.beforeStorageWrite = null;
    await m.mergeInto(m.queryClient, USERS.a.id);
    expect(server.carts.get(USERS.a.id)).toEqual([line('folding-lock', 2)]);
  });

  it('notes what did not fit, and still takes the whole merge off the phone', async () => {
    server.carts.set(USERS.a.id, [...fill(49), line('folding-lock', 9)]);
    onPhone([line('folding-lock', 3), line('e1-fork-160', 2)]);
    const m = await launch();
    await signIn(m, 'a');
    await m.mergeInto(m.queryClient, USERS.a.id);
    const account = server.carts.get(USERS.a.id)!;
    expect(account).toHaveLength(50);
    expect(account.find((l) => l.slug === 'folding-lock')?.quantity).toBe(10);
    expect(stored()).toBeNull();
    expect(m.queryClient.getQueryData(m.accountCartKey(USERS.a.id))).toMatchObject({ itemCount: 59 });
    // 2 locks over the 10 of a line, and both forks: no room for a 51st line
    expect(m.mergeNotice(USERS.a.id)).toBe(4);
    expect(m.mergeNotice(USERS.b.id)).toBe(0);
    m.dismissMergeNotice();
    expect(m.mergeNotice(USERS.a.id)).toBe(0);
  });

  it('stops for an account that signed out while its merge was out', async () => {
    onPhone([line('folding-lock', 2)]);
    const m = await launch();
    await signIn(m, 'a');
    const hold = deferred();
    server.gate('/me/cart/merge', { wait: hold.wait, after: true });
    const merging = m.mergeInto(m.queryClient, USERS.a.id);
    await vi.waitFor(() => expect(server.calls('/me/cart/merge')).toHaveLength(1));
    await m.auth.signOut();
    await signIn(m, 'b');
    hold.resolve();
    await merging;
    expect(server.carts.get(USERS.a.id)).toEqual([line('folding-lock', 2)]);
    expect(m.queryClient.getQueryData(m.accountCartKey(USERS.a.id))).toBeUndefined();
    expect(server.calls('/me/cart/merge')).toHaveLength(1);
    expect(stored()).toBeNull();
  });
});

describe('guest cart', () => {
  it('lowers a merge left waiting when the shopper lowers or removes its lines', async () => {
    onPhone([line('folding-lock', 3), line('e1-fork-160', 1)]);
    const m = await launch();
    await signIn(m, 'a');
    server.gate('/me/cart/merge', { reply: { status: 503, body: {} } });
    await m.mergeInto(m.queryClient, USERS.a.id).catch(() => undefined);
    await m.auth.signOut();

    await m.guestActions.adjust('folding-lock', '', -2);
    await m.guestActions.adjust('folding-lock', '', 5);
    expect(stored()!.pending!.cart.items).toEqual([line('folding-lock', 1), line('e1-fork-160', 1)]);
    await m.guestActions.remove('e1-fork-160', '');
    await m.guestActions.remove('folding-lock', '');
    expect(stored()).toBeNull();
  });

  it('refuses a 51st part but still changes the 50 it holds', async () => {
    onPhone(fill(50));
    const m = await launch();
    expect(await m.guestActions.add('folding-lock', '', 1)).toBe('cart-full');
    await m.guestActions.adjust('part-0', '', 1);
    expect(await m.guestActions.add('part-1', '', 1)).toBe('added');
    expect(stored()!.items).toHaveLength(50);
    expect(
      stored()!
        .items.filter((l) => l.quantity === 2)
        .map((l) => l.slug),
    ).toEqual(['part-0', 'part-1']);
  });

  it('keeps a changed line in its place and puts a new one last', async () => {
    onPhone([line('folding-lock', 1), line('e1-fork-160', 1)]);
    const m = await launch();
    await m.guestActions.adjust('folding-lock', '', 1);
    await m.guestActions.add('e1-frame-m', 'signal', 1);
    expect(stored()!.items).toEqual([
      line('folding-lock', 2),
      line('e1-fork-160', 1),
      line('e1-frame-m', 1, 'signal'),
    ]);
  });

  it('does not bring back a line that is no longer on the phone', async () => {
    onPhone([line('folding-lock', 1)]);
    const m = await launch();
    await m.guestActions.adjust('e1-fork-160', '', 1);
    expect(stored()!.items).toEqual([line('folding-lock', 1)]);
  });

  it('brings its lines in line with the quote: parts gone, finishes replaced, and lines that became one', async () => {
    const lines = [
      line('withdrawn-part', 2),
      line('e1-frame-m', 4, 'sunset'),
      line('e1-frame-m', 8, 'signal'),
      line('e1-frame-m', 1, 'ember'),
      line('folding-lock', 1, 'red'),
    ];
    onPhone(lines);
    const m = await launch();
    const quote = await m.quoteGuestCart(lines);
    expect(quote.items.map((l) => [l.product.slug, l.colorKey, l.quantity])).toEqual([
      ['e1-frame-m', 'signal', 10],
      ['e1-frame-m', 'ember', 1],
      ['folding-lock', '', 1],
    ]);
    await vi.waitFor(() =>
      expect(stored()!.items).toEqual([
        line('e1-frame-m', 10, 'signal'),
        line('e1-frame-m', 1, 'ember'),
        line('folding-lock', 1),
      ]),
    );
  });

  it('reads a merge left waiting the same way, so it is not merged a second time', async () => {
    const key = '6f9619ff-8b86-4d01-b42d-00cf4fc964ff';
    const lines = [line('e1-frame-m', 4, 'sunset')];
    onPhone(lines, { key, cart: { items: lines, builds: [] } });
    const m = await launch();
    await m.quoteGuestCart(lines);
    await vi.waitFor(() => expect(stored()!.items).toEqual([line('e1-frame-m', 4, 'signal')]));
    expect(stored()!.pending!.cart.items).toEqual([line('e1-frame-m', 4, 'signal')]);

    await signIn(m, 'a');
    await m.mergeInto(m.queryClient, USERS.a.id);
    expect(server.carts.get(USERS.a.id)).toEqual([line('e1-frame-m', 4, 'signal')]);
    expect(stored()).toBeNull();
  });
});

describe('account cart', () => {
  it('refuses a 51st part and an 11th of one, and adds otherwise', async () => {
    server.carts.set(USERS.a.id, [...fill(49), line('folding-lock', 10)]);
    const m = await launch();
    await signIn(m, 'a');
    const actions = m.accountActions(m.queryClient, USERS.a.id);
    expect(await actions.add('e1-fork-160', '', 1)).toBe('cart-full');
    expect(await actions.add('folding-lock', '', 1)).toBe('line-full');
    expect(await actions.add('part-3', '', 1)).toBe('added');
    expect(server.calls('/me/cart/items')).toHaveLength(1);

    server.carts.set(USERS.a.id, fill(49));
    expect(await actions.add('e1-fork-160', '', 1)).toBe('added');
  });

  it('shows the cart as it is, without adding back, a line removed elsewhere', async () => {
    server.carts.set(USERS.a.id, [line('folding-lock', 1)]);
    const m = await launch();
    await signIn(m, 'a');
    await m.accountActions(m.queryClient, USERS.a.id).adjust('e1-fork-160', '', 1);
    expect(server.calls('/me/cart/items')).toHaveLength(0);
    expect(m.queryClient.getQueryData(m.accountCartKey(USERS.a.id))).toMatchObject({ itemCount: 1 });
  });

  it('redraws the cart after a change the API refused', async () => {
    const m = await launch();
    await signIn(m, 'a');
    const key = m.accountCartKey(USERS.a.id);
    m.queryClient.setQueryData(
      key,
      cartSchema.parse({ items: [], builds: [], subtotal: 0, itemCount: 0, canCheckout: false }),
    );
    await expect(
      m.accountActions(m.queryClient, USERS.a.id).remove('withdrawn-part', ''),
    ).rejects.toMatchObject({
      status: 404,
    });
    expect(m.queryClient.getQueryState(key)?.isInvalidated).toBe(true);
  });

  it('is not overwritten by a read of the cart that was already on its way', async () => {
    const m = await launch();
    await signIn(m, 'a');
    const key = m.accountCartKey(USERS.a.id);
    const hold = deferred();
    server.gate('/me/cart', { wait: hold.wait, after: true });
    void m.queryClient
      .query({ queryKey: key, queryFn: () => m.authedApi('/me/cart', cartSchema) })
      .catch(() => undefined);
    // read by the server before the change, its reply held until after it
    await vi.waitFor(() => expect(server.calls('/me/cart')).toHaveLength(1));
    await m.accountActions(m.queryClient, USERS.a.id).add('folding-lock', '', 2);
    hold.resolve();
    await new Promise((r) => setTimeout(r, 10));
    expect(m.queryClient.getQueryData(key)).toMatchObject({ itemCount: 2 });
  });
});
