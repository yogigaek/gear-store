import {
  guestCartSchema,
  MAX_CART_BUILDS,
  MAX_LINE_QUANTITY,
  type BuildSelection,
  type GuestCart,
} from '@gear-store/shared';
import { useSyncExternalStore } from 'react';

// A guest's cart is only which parts and bikes, and how many, kept in this browser. Prices, stock and whether a
// bike can be built always come from the API.
const KEY = 'rakit:cart:v2';
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
};

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
