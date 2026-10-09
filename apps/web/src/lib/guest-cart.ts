import { cartLineInputSchema, type CartLineInput, MAX_LINE_QUANTITY } from '@gear-store/shared';
import { useSyncExternalStore } from 'react';
import { z } from 'zod';

// A guest's cart is only which products and how many, kept in this browser. Prices always come from the API.
const KEY = 'rakit:cart';
const listeners = new Set<() => void>();
let cache: CartLineInput[] | undefined;

function read(): CartLineInput[] {
  if (cache) return cache;
  try {
    const parsed = z.array(cartLineInputSchema).safeParse(JSON.parse(localStorage.getItem(KEY) ?? '[]'));
    cache = parsed.success ? parsed.data.filter((l) => l.quantity > 0) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(lines: CartLineInput[]) {
  cache = lines.filter((l) => l.quantity > 0);
  try {
    if (cache.length) localStorage.setItem(KEY, JSON.stringify(cache));
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

export const guestCart = {
  lines: read,
  set(slug: string, colorKey: string, quantity: number) {
    const rest = read().filter((l) => !(l.slug === slug && l.colorKey === colorKey));
    write(
      quantity > 0 ? [...rest, { slug, colorKey, quantity: Math.min(quantity, MAX_LINE_QUANTITY) }] : rest,
    );
  },
  replace: write,
  clear: () => write([]),
};

export function useGuestCartLines(): CartLineInput[] {
  return useSyncExternalStore(
    (notify) => {
      listeners.add(notify);
      return () => listeners.delete(notify);
    },
    read,
    () => [],
  );
}
