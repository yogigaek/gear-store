import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  cartSchema,
  MAX_CART_LINES,
  MAX_LINE_QUANTITY,
  mergeCartResultSchema,
  productDetailSchema,
  type Cart,
  type CartLineInput,
} from '@gear-store/shared';
import { keepPreviousData, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { useSyncExternalStore } from 'react';
import { api, ApiError, retryTransient } from './api';
import { authedApi, currentUserId, useAuth } from './auth';
import { capPending, parseStored, reconcile, subtract, type PendingMerge } from './cart-store';

// Signed out, the cart is only which parts, in which finish, and how many, kept on this phone; prices, stock and
// the total always come from the API (POST /cart/quote), as on the web. Signed in, the cart is the account's,
// read and changed on the server. Bikes are configured on the web; the phone shows and counts them.
//
// The phone's lines and the merge in progress are one record under one key, so a single write moves both: the
// app can be killed at any moment without merging the same lines twice. Every change to the cart, on the phone
// or on the server, and every merge, runs one at a time through `serial`, so each starts from the result of
// the one before (two quick taps add two, not one).
const STORE_KEY = 'rakit:mobile-cart:v1';

export const accountCartKey = (userId: string) => ['me', userId, 'cart'] as const;

const listeners = new Set<() => void>();
let items: CartLineInput[] = [];
let pending: PendingMerge | null = null;
// a launch read that failed leaves the stored record alone: writing would replace a cart this run never saw
let persistable = false;
// how many parts the last merge could not fit into that account's cart, until the shopper dismisses it
let notice: { userId: string; count: number } | null = null;

const notify = () => listeners.forEach((l) => l());
// merges under way, and whether the last one to finish failed: checkout says when the phone's lines did not
// make it into the account (several can overlap: sign-in, the app's return to the foreground, "Try again")
let merging = 0;
let lastMergeFailed = false;

const loaded = AsyncStorage.getItem(STORE_KEY)
  .then((raw) => {
    // an unreadable record holds nothing to keep: start empty and write over it
    ({ items, pending } = parseStored(raw));
    persistable = true;
  })
  .catch(() => undefined)
  .finally(notify);

let queue: Promise<unknown> = loaded;
function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

/** True once the record is stored; this run keeps the cart in memory either way. */
async function save(next: { items: CartLineInput[]; pending: PendingMerge | null }): Promise<boolean> {
  items = next.items.filter((l) => l.quantity > 0);
  pending = next.pending;
  notify();
  if (!persistable) return false;
  try {
    if (items.length || pending) await AsyncStorage.setItem(STORE_KEY, JSON.stringify({ items, pending }));
    else await AsyncStorage.removeItem(STORE_KEY);
    return true;
  } catch {
    return false;
  }
}

const sameLine = (l: { slug: string; colorKey: string }, slug: string, colorKey: string) =>
  l.slug === slug && l.colorKey === colorKey;
const clamp = (quantity: number) => Math.max(0, Math.min(quantity, MAX_LINE_QUANTITY));

function setGuestLine(slug: string, colorKey: string, quantity: number) {
  const line = { slug, colorKey, quantity: clamp(quantity) };
  // a changed line keeps its place in the list; a new one goes last
  const next = items.some((l) => sameLine(l, slug, colorKey))
    ? items.map((l) => (sameLine(l, slug, colorKey) ? line : l))
    : [...items, line];
  return save({
    items: next.filter((l) => l.quantity > 0),
    pending: pending && capPending(pending, line),
  });
}

/** the outcome of adding a part: added, refused because the cart holds 50 parts, or already at 10 of it */
export type AddResult = 'added' | 'cart-full' | 'line-full';

/**
 * Signed in: runs `task` for the account that was signed in when it was queued, and refuses once that account
 * has signed out, so nothing reaches or shows another account.
 */
function forAccount<T>(userId: string, task: () => Promise<T>): Promise<T> {
  return serial(async () => {
    if (currentUserId() !== userId) throw new ApiError(401, 'You were signed out. Sign in and try again.');
    return task();
  });
}

async function showAccountCart(queryClient: QueryClient, userId: string, cart: Cart) {
  if (currentUserId() !== userId) return;
  // a read of the cart already on its way would land after this and put the older cart back
  await queryClient.cancelQueries({ queryKey: accountCartKey(userId) });
  if (currentUserId() === userId) queryClient.setQueryData(accountCartKey(userId), cart);
}

/** Changes to the account's cart on the server, for `userId` only. */
export function accountActions(queryClient: QueryClient, userId: string) {
  // checked again right before writing: a sign-out (or another sign-in) can land while the fresh read is out
  const stillSignedIn = () => {
    if (currentUserId() !== userId) throw new ApiError(401, 'You were signed out. Sign in and try again.');
  };
  const send = async (path: string, body: unknown) => {
    stillSignedIn();
    try {
      await showAccountCart(queryClient, userId, await authedApi(path, cartSchema, { method: 'PUT', body }));
    } catch (error) {
      // e.g. a 404 for a line removed on the web meanwhile: the cart on screen is redrawn as it now is
      void queryClient.invalidateQueries({ queryKey: accountCartKey(userId) });
      throw error;
    }
  };
  const put = (slug: string, colorKey: string, quantity: number) =>
    send('/me/cart/items', { slug, colorKey, quantity: clamp(quantity) });
  const putBuild = (id: string, quantity: number) =>
    send(`/me/cart/builds/${encodeURIComponent(id)}`, { quantity: clamp(quantity) });
  // the account's cart as it is now, not as cached: lines are set to exact quantities
  const fresh = () => authedApi('/me/cart', cartSchema);
  const findLine = (cart: Cart, slug: string, colorKey: string) =>
    cart.items.find((l) => sameLine({ slug: l.product.slug, colorKey: l.colorKey }, slug, colorKey));
  return {
    add: (slug: string, colorKey: string, quantity: number) =>
      forAccount(userId, async (): Promise<AddResult> => {
        const cart = await fresh();
        const line = findLine(cart, slug, colorKey);
        if (!line && cart.items.length >= MAX_CART_LINES) return 'cart-full';
        if (line && line.quantity >= MAX_LINE_QUANTITY) return 'line-full';
        await put(slug, colorKey, (line?.quantity ?? 0) + quantity);
        return 'added';
      }),
    adjust: (slug: string, colorKey: string, delta: number) =>
      forAccount(userId, async () => {
        const cart = await fresh();
        const line = findLine(cart, slug, colorKey);
        // gone since it was drawn (removed on the web, say): show the cart as it is rather than add it back
        if (!line) return showAccountCart(queryClient, userId, cart);
        await put(slug, colorKey, line.quantity + delta);
      }),
    remove: (slug: string, colorKey: string) => forAccount(userId, () => put(slug, colorKey, 0)),
    adjustBuild: (id: string, delta: number) =>
      forAccount(userId, async () => {
        const cart = await fresh();
        const build = cart.builds.find((b) => b.id === id);
        if (!build) return showAccountCart(queryClient, userId, cart);
        await putBuild(id, build.quantity + delta);
      }),
    removeBuild: (id: string) => forAccount(userId, () => putBuild(id, 0)),
  };
}

/** Changes to the cart kept on this phone while signed out. */
export const guestActions = {
  add: (slug: string, colorKey: string, quantity: number) =>
    serial(async (): Promise<AddResult> => {
      const line = items.find((l) => sameLine(l, slug, colorKey));
      if (!line && items.length >= MAX_CART_LINES) return 'cart-full';
      if (line && line.quantity >= MAX_LINE_QUANTITY) return 'line-full';
      await setGuestLine(slug, colorKey, (line?.quantity ?? 0) + quantity);
      return 'added';
    }),
  adjust: (slug: string, colorKey: string, delta: number) =>
    serial(async () => {
      const line = items.find((l) => sameLine(l, slug, colorKey));
      if (line) await setGuestLine(slug, colorKey, line.quantity + delta);
    }),
  remove: (slug: string, colorKey: string) => serial(() => setGuestLine(slug, colorKey, 0)),
  adjustBuild: () => Promise.reject(new Error('Bikes are changed on the website')),
  removeBuild: () => Promise.reject(new Error('Bikes are changed on the website')),
};

/**
 * Prices the phone's lines (POST /cart/quote). The API drops parts no longer sold and replaces a finish a part no
 * longer has; the phone's lines are brought in line with that reply, so every row shown is a line −, + and Remove
 * can reach, and lines that are gone stop counting towards the 50.
 */
export async function quoteGuestCart(lines: CartLineInput[]): Promise<Cart> {
  const cart = await api('/cart/quote', cartSchema, { method: 'POST', body: { items: lines, builds: [] } });
  void alignWithQuote(lines, cart).catch(() => undefined);
  return cart;
}

async function alignWithQuote(lines: CartLineInput[], cart: Cart) {
  const sold = new Set(cart.items.map((l) => l.product.slug));
  const shown = (l: CartLineInput) =>
    cart.items.some((c) => sameLine({ slug: c.product.slug, colorKey: c.colorKey }, l.slug, l.colorKey));
  const finishes = new Map<string, string[] | null>();
  for (const l of lines) {
    if (finishes.has(l.slug)) continue;
    if (!sold.has(l.slug)) finishes.set(l.slug, null);
    else if (!shown(l)) {
      // the reply does not say which finish took the place of this one: the part's own list does (its first)
      const part = await api(`/products/${encodeURIComponent(l.slug)}`, productDetailSchema);
      finishes.set(
        l.slug,
        part.colors.map((c) => c.key),
      );
    }
  }
  if (finishes.size === 0) return;
  await serial(async () => {
    // a merge waiting to be resent is read the same way, so what it takes off the phone matches its lines
    const next = {
      items: reconcile(items, finishes),
      pending: pending && {
        key: pending.key,
        cart: { ...pending.cart, items: reconcile(pending.cart.items, finishes) },
      },
    };
    if (JSON.stringify(next) !== JSON.stringify({ items, pending })) await save(next);
  });
}

/**
 * Moves the phone's cart into `userId`'s account (as the web's CartSync does). The merge and its key are stored
 * before it is sent, and one cut off before its reply is resent exactly as before under the same key, which the
 * API recognises, so nothing is added twice; the phone's lines go only once the API confirms, keeping anything
 * added since. A 400 (nothing was added) drops the attempt and keeps the lines; any other failure keeps
 * everything for the next try (sign-in, launch, or the app coming back to the foreground).
 */
export function mergeInto(queryClient: QueryClient, userId: string): Promise<void> {
  merging += 1;
  notify();
  const settle = (failed: boolean) => {
    merging -= 1;
    lastMergeFailed = failed;
    notify();
  };
  return mergeAll(queryClient, userId).then(
    () => settle(false),
    (error: unknown) => {
      settle(true);
      throw error;
    },
  );
}

function mergeAll(queryClient: QueryClient, userId: string): Promise<void> {
  return forAccount(userId, async () => {
    for (;;) {
      let job = pending;
      if (!job) {
        if (!items.length) return;
        job = { key: randomUUID(), cart: { items, builds: [] } };
        // sent only once stored: a merge the next launch cannot see could be sent again under another key
        if (!(await save({ items, pending: job }))) {
          pending = null;
          throw new Error('Could not keep the cart on this phone');
        }
      }
      let reply;
      try {
        reply = await authedApi('/me/cart/merge', mergeCartResultSchema, {
          method: 'POST',
          body: { ...job.cart, mergeKey: job.key },
        });
      } catch (error) {
        if (error instanceof ApiError && error.status === 400) await save({ items, pending: null });
        throw error;
      }
      const { notMerged, ...cart } = reply;
      const left = notMerged.reduce((sum, l) => sum + l.quantity, 0);
      if (left > 0) notice = { userId, count: left };
      // the merged cart is on screen before the phone's lines go, so checkout never shows it empty in between
      await showAccountCart(queryClient, userId, cart);
      await save({ items: subtract(items, job.cart.items), pending: null });
      if (currentUserId() !== userId) return;
    }
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** the lines held on this phone, re-rendering on every change */
export function useGuestItems(): CartLineInput[] {
  return useSyncExternalStore(subscribe, () => items);
}

/** the phone's own lines, seen from a signed-in account: none left, on their way in, or stuck after a failed merge */
export function phoneLines(): 'none' | 'joining' | 'failed' {
  if (!items.length && !pending) return 'none';
  return merging === 0 && lastMergeFailed ? 'failed' : 'joining';
}

export function usePhoneLines(): 'none' | 'joining' | 'failed' {
  return useSyncExternalStore(subscribe, phoneLines);
}

/** how many parts the last merge into `userId`'s cart could not fit, 0 for none */
export function mergeNotice(userId: string | null): number {
  return notice && notice.userId === userId ? notice.count : 0;
}

export function dismissMergeNotice() {
  notice = null;
  notify();
}

/** mergeNotice, re-rendering when it changes */
export function useMergeNotice(userId: string | null): number {
  useSyncExternalStore(subscribe, () => notice);
  return mergeNotice(userId);
}

/** Prices exactly `lines` (POST /cart/quote) without reading or changing any cart: a Buy now's checkout. */
export function useLinesQuote(lines: CartLineInput[] | null) {
  return useQuery({
    queryKey: ['lines-quote', lines],
    queryFn: () =>
      api('/cart/quote', cartSchema, { method: 'POST', body: { items: lines ?? [], builds: [] } }),
    enabled: lines !== null,
    retry: retryTransient,
  });
}

/** The cart as the server prices it: the account's when signed in, else the phone's lines quoted. */
export function useCart() {
  const state = useAuth();
  const userId = state.status === 'signed-in' ? state.user.id : null;
  const lines = useGuestItems();
  const account = useQuery({
    queryKey: accountCartKey(userId ?? ''),
    queryFn: () => authedApi('/me/cart', cartSchema),
    enabled: userId !== null,
  });
  const guest = useQuery({
    queryKey: ['cart-quote', lines],
    queryFn: () => quoteGuestCart(lines),
    enabled: state.status === 'signed-out' && lines.length > 0,
    placeholderData: keepPreviousData,
  });
  if (state.status === 'restoring') return { mode: 'restoring' as const };
  if (userId) return { mode: 'account' as const, query: account };
  return { mode: 'guest' as const, query: guest, lineCount: lines.length };
}

/** the number of parts and bikes in the cart, for the header */
export function useCartCount(): number {
  const cart = useCart();
  const raw = useGuestItems().reduce((sum, l) => sum + l.quantity, 0);
  if (cart.mode === 'restoring') return 0;
  if (cart.mode === 'account') return cart.query.data?.itemCount ?? 0;
  return cart.lineCount === 0 ? 0 : (cart.query.data?.itemCount ?? raw);
}

/** Changes to the cart, sent to the account when signed in and kept on the phone otherwise. */
export function useCartActions() {
  const state = useAuth();
  const queryClient = useQueryClient();
  return state.status === 'signed-in' ? accountActions(queryClient, state.user.id) : guestActions;
}
