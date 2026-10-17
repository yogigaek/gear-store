import {
  guestCartSchema,
  MAX_CART_BUILDS,
  MAX_LINE_QUANTITY,
  type BuildSelection,
  type GuestCart,
} from '@gear-store/shared';
import { useSyncExternalStore } from 'react';
import { z } from 'zod';

// A guest's cart is only which parts and bikes, and how many, kept in this browser. Prices, stock and whether a
// bike can be built always come from the API.
const KEY = 'rakit:cart:v2';
/** the cart being merged into an account, with the key the API knows it by, until the API confirms */
const PENDING_KEY = 'rakit:cart:pending-merge';
const EMPTY: GuestCart = { items: [], builds: [] };
const listeners = new Set<() => void>();
let cache: GuestCart | undefined;

function read(): GuestCart {
  if (cache) return cache;
  try {
    const parsed = guestCartSchema.safeParse(JSON.parse(localStorage.getItem(KEY) ?? 'null'));
    cache = parsed.success ? parsed.data : EMPTY;
  } catch {
    cache = EMPTY;
  }
  return cache;
}

function write(next: GuestCart) {
  cache = { items: next.items.filter((l) => l.quantity > 0), builds: next.builds };
  try {
    if (cache.items.length || cache.builds.length) localStorage.setItem(KEY, JSON.stringify(cache));
    else localStorage.removeItem(KEY);
  } catch {
    // storage blocked: the cart still works for this visit
  }
  listeners.forEach((l) => l());
}

// another tab changed the cart
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return;
    cache = undefined;
    listeners.forEach((l) => l());
  });
}

/** two selections of the same parts in the same colour are the same bike */
const sameBuild = (a: BuildSelection, b: BuildSelection) =>
  a.colorKey === b.colorKey && Object.values(a.parts).sort().join() === Object.values(b.parts).sort().join();

export const guestCart = {
  read,
  set(slug: string, colorKey: string, quantity: number) {
    const { items, builds } = read();
    const rest = items.filter((l) => !(l.slug === slug && l.colorKey === colorKey));
    const line = { slug, colorKey, quantity: Math.min(quantity, MAX_LINE_QUANTITY) };
    write({ items: quantity > 0 ? [...rest, line] : rest, builds });
  },
  /** adds a bike; the same bike again adds to its quantity. False when the cart holds no more bikes. */
  addBuild(selection: BuildSelection, quantity: number): boolean {
    const { items, builds } = read();
    const same = builds.find((b) => sameBuild(b, selection));
    if (same) {
      const updated = { ...same, quantity: Math.min(MAX_LINE_QUANTITY, same.quantity + quantity) };
      write({ items, builds: builds.map((b) => (b === same ? updated : b)) });
      return true;
    }
    if (builds.length >= MAX_CART_BUILDS) return false;
    write({ items, builds: [...builds, { ...selection, quantity, key: crypto.randomUUID() }] });
    return true;
  },
  setBuild(key: string, quantity: number) {
    const { items, builds } = read();
    write({
      items,
      builds:
        quantity > 0
          ? builds.map((b) => (b.key === key ? { ...b, quantity: Math.min(quantity, MAX_LINE_QUANTITY) } : b))
          : builds.filter((b) => b.key !== key),
    });
  },
  clear: () => write(EMPTY),
  /**
   * The cart to merge into the account after sign-in. A merge whose reply never arrived is offered again,
   * exactly as sent and under the same key, so the API recognises it and adds nothing twice; only when it is
   * confirmed does anything added since get a merge of its own. Null when there is nothing to merge.
   */
  beginMerge(): PendingMerge | null {
    const pending = readPending();
    if (pending) return pending;
    const cart = read();
    if (cart.items.length + cart.builds.length === 0) return null;
    const next = { key: crypto.randomUUID(), cart };
    savePending(next);
    return next;
  },
  /** The API has the merged cart: take it out of this browser, keeping anything added since. */
  finishMerge(done: PendingMerge) {
    // another tab may already have finished this one and started the next: only ever clear our own
    if (readPending()?.key === done.key) savePending(null);
    write(subtract(read(), done.cart));
  },
  /** The API refused the merge outright (nothing was added): drop it, keep the cart for a fresh one. */
  abandonMerge(job: PendingMerge) {
    if (readPending()?.key === job.key) savePending(null);
  },
};

export interface PendingMerge {
  key: string;
  cart: GuestCart;
}

function readPending(): PendingMerge | null {
  try {
    const raw = JSON.parse(localStorage.getItem(PENDING_KEY) ?? 'null') as { key?: unknown; cart?: unknown };
    const cart = guestCartSchema.safeParse(raw?.cart);
    const key = z.uuid().safeParse(raw?.key);
    return key.success && cart.success ? { key: key.data, cart: cart.data } : null;
  } catch {
    return null;
  }
}

function savePending(pending: PendingMerge | null) {
  try {
    if (pending) localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
    else localStorage.removeItem(PENDING_KEY);
  } catch {
    // storage blocked: the merge simply is not resumable after a reload
  }
}

/** what is left of `cart` once `merged` has gone to the account: quantities taken off, part by part and bike by bike */
export function subtract(cart: GuestCart, merged: GuestCart): GuestCart {
  const lineKey = (l: { slug: string; colorKey: string }) => `${l.slug}\u0000${l.colorKey}`;
  const mergedLines = new Map(merged.items.map((l) => [lineKey(l), l.quantity]));
  // a bike is the same bike by its parts and colour, whatever key this browser gave it
  const left = merged.builds.map((b) => ({ ...b }));
  return {
    items: cart.items
      .map((l) => ({ ...l, quantity: l.quantity - (mergedLines.get(lineKey(l)) ?? 0) }))
      .filter((l) => l.quantity > 0),
    builds: cart.builds
      .map((b) => {
        const gone = left.find((m) => m.quantity > 0 && sameBuild(m, b));
        if (!gone) return b;
        const taken = Math.min(gone.quantity, b.quantity);
        gone.quantity -= taken;
        return { ...b, quantity: b.quantity - taken };
      })
      .filter((b) => b.quantity > 0),
  };
}

export function useGuestCart(): GuestCart {
  return useSyncExternalStore(
    (notify) => {
      listeners.add(notify);
      return () => listeners.delete(notify);
    },
    read,
    () => EMPTY,
  );
}
