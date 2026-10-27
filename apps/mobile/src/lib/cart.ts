import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  cartSchema,
  MAX_CART_LINES,
  MAX_LINE_QUANTITY,
  type Cart,
  type CartLineInput,
} from '@gear-store/shared';
import { keepPreviousData, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { useSyncExternalStore } from 'react';
import { api, ApiError } from './api';
import { authedApi, currentUserId, useAuth } from './auth';
import { parseStored, subtract, type PendingMerge } from './cart-store';

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

const loaded = AsyncStorage.getItem(STORE_KEY)
  .then((raw) => {
    // an unreadable record holds nothing to keep: start empty and write over it
    ({ items, pending } = parseStored(raw));
    persistable = true;
  })
  .catch(() => undefined)
  .finally(() => listeners.forEach((l) => l()));

let queue: Promise<unknown> = loaded;
function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

async function save(next: { items: CartLineInput[]; pending: PendingMerge | null }) {
  items = next.items.filter((l) => l.quantity > 0);
  pending = next.pending;
  listeners.forEach((l) => l());
  if (!persistable) return;
  try {
    if (items.length || pending) await AsyncStorage.setItem(STORE_KEY, JSON.stringify({ items, pending }));
    else await AsyncStorage.removeItem(STORE_KEY);
  } catch {
    // storage refused: this run keeps the cart in memory; the stored record is the last one written
  }
}

const sameLine = (l: { slug: string; colorKey: string }, slug: string, colorKey: string) =>
  l.slug === slug && l.colorKey === colorKey;
const clamp = (quantity: number) => Math.max(0, Math.min(quantity, MAX_LINE_QUANTITY));

function setGuestLine(slug: string, colorKey: string, quantity: number) {
  const rest = items.filter((l) => !sameLine(l, slug, colorKey));
  const line = { slug, colorKey, quantity: clamp(quantity) };
  return save({ items: line.quantity > 0 ? [...rest, line] : rest, pending });
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

function showAccountCart(queryClient: QueryClient, userId: string, cart: Cart) {
  if (currentUserId() === userId) queryClient.setQueryData(accountCartKey(userId), cart);
}

function accountActions(queryClient: QueryClient, userId: string) {
  // checked again right before writing: a sign-out (or another sign-in) can land while the fresh read is out
  const stillSignedIn = () => {
    if (currentUserId() !== userId) throw new ApiError(401, 'You were signed out. Sign in and try again.');
  };
  const put = async (slug: string, colorKey: string, quantity: number) => {
    stillSignedIn();
    const cart = await authedApi('/me/cart/items', cartSchema, {
      method: 'PUT',
      body: { slug, colorKey, quantity: clamp(quantity) },
    });
    showAccountCart(queryClient, userId, cart);
  };
  const putBuild = async (id: string, quantity: number) => {
    stillSignedIn();
    const cart = await authedApi(`/me/cart/builds/${encodeURIComponent(id)}`, cartSchema, {
      method: 'PUT',
      body: { quantity: clamp(quantity) },
    });
    showAccountCart(queryClient, userId, cart);
  };
  // the account's cart as it is now, not as cached: lines are set to exact quantities
  const fresh = () => authedApi('/me/cart', cartSchema);
  return {
    add: (slug: string, colorKey: string, quantity: number) =>
      forAccount(userId, async (): Promise<AddResult> => {
        const cart = await fresh();
        const line = cart.items.find((l) =>
          sameLine({ slug: l.product.slug, colorKey: l.colorKey }, slug, colorKey),
        );
        if (!line && cart.items.length >= MAX_CART_LINES) return 'cart-full';
        if (line && line.quantity >= MAX_LINE_QUANTITY) return 'line-full';
        await put(slug, colorKey, (line?.quantity ?? 0) + quantity);
        return 'added';
      }),
    adjust: (slug: string, colorKey: string, delta: number) =>
      forAccount(userId, async () => {
        const cart = await fresh();
        const line = cart.items.find((l) =>
          sameLine({ slug: l.product.slug, colorKey: l.colorKey }, slug, colorKey),
        );
        await put(slug, colorKey, (line?.quantity ?? 0) + delta);
      }),
    remove: (slug: string, colorKey: string) => forAccount(userId, () => put(slug, colorKey, 0)),
    adjustBuild: (id: string, delta: number) =>
      forAccount(userId, async () => {
        const build = (await fresh()).builds.find((b) => b.id === id);
        await putBuild(id, (build?.quantity ?? 0) + delta);
      }),
    removeBuild: (id: string) => forAccount(userId, () => putBuild(id, 0)),
  };
}

const guestActions = {
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
      if (!line && delta > 0 && items.length >= MAX_CART_LINES)
        throw new Error(`A cart holds up to ${MAX_CART_LINES} different parts.`);
      await setGuestLine(slug, colorKey, (line?.quantity ?? 0) + delta);
    }),
  remove: (slug: string, colorKey: string) => serial(() => setGuestLine(slug, colorKey, 0)),
  adjustBuild: () => Promise.reject(new Error('Bikes are changed on the website')),
  removeBuild: () => Promise.reject(new Error('Bikes are changed on the website')),
};

/**
 * Moves the phone's cart into `userId`'s account (as the web's CartSync does). A merge cut off before its reply
 * is resent exactly as before under the same key, which the API recognises, so nothing is added twice; the
 * phone's lines go only once the API confirms, keeping anything added since. A 400 (nothing was added) drops
 * the attempt and keeps the lines; any other failure keeps everything for the next sign-in or launch.
 */
export function mergeInto(queryClient: QueryClient, userId: string): Promise<void> {
  return forAccount(userId, async () => {
    for (;;) {
      const job: PendingMerge | null =
        pending ?? (items.length ? { key: randomUUID(), cart: { items, builds: [] } } : null);
      if (!job) return;
      if (job !== pending) await save({ items, pending: job });
      let cart: Cart;
      try {
        cart = await authedApi('/me/cart/merge', cartSchema, {
          method: 'POST',
          body: { ...job.cart, mergeKey: job.key },
        });
      } catch (error) {
        if (error instanceof ApiError && error.status === 400) await save({ items, pending: null });
        throw error;
      }
      await save({ items: subtract(items, job.cart.items), pending: null });
      showAccountCart(queryClient, userId, cart);
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
    queryFn: () => api('/cart/quote', cartSchema, { method: 'POST', body: { items: lines, builds: [] } }),
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
