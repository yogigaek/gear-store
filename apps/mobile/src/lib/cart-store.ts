import {
  cartLineInputSchema,
  guestCartSchema,
  MAX_CART_LINES,
  MAX_LINE_QUANTITY,
  type CartLineInput,
  type GuestCart,
} from '@gear-store/shared';
import { z } from 'zod';

// The cart's stored record and its arithmetic, without React Native, so it can be tested on its own.

export interface PendingMerge {
  key: string;
  cart: GuestCart;
}

export interface StoredCart {
  items: CartLineInput[];
  pending: PendingMerge | null;
}

// line by line: one line a later release no longer accepts drops alone, not the whole cart
const storedSchema = z.object({
  items: z
    .array(z.unknown())
    .catch([])
    .transform((lines) =>
      lines
        .flatMap((l) => {
          // a quantity above today's limit (from a release that allowed more) is capped rather than dropped
          const capped =
            typeof l === 'object' && l !== null && 'quantity' in l && typeof l.quantity === 'number'
              ? { ...l, quantity: Math.min(l.quantity, MAX_LINE_QUANTITY) }
              : l;
          const line = cartLineInputSchema.safeParse(capped);
          return line.success ? [line.data] : [];
        })
        .slice(0, MAX_CART_LINES),
    ),
  pending: z.object({ key: z.uuid(), cart: guestCartSchema }).nullable().catch(null),
});

/** the stored record as written by this app; anything unreadable counts as an empty cart */
export function parseStored(raw: string | null): StoredCart {
  let value: unknown = {};
  try {
    value = raw === null ? {} : JSON.parse(raw);
  } catch {
    // an unreadable record holds nothing to keep
  }
  const parsed = storedSchema.safeParse(value);
  return parsed.success ? parsed.data : { items: [], pending: null };
}

const lineKey = (l: { slug: string; colorKey: string }) => `${l.slug}\u0000${l.colorKey}`;

/** what is left of the phone's cart once `merged` has gone to the account: quantities taken off, part by part */
export function subtract(cart: CartLineInput[], merged: CartLineInput[]): CartLineInput[] {
  const gone = new Map(merged.map((l) => [lineKey(l), l.quantity]));
  return cart
    .map((l) => ({ ...l, quantity: l.quantity - (gone.get(lineKey(l)) ?? 0) }))
    .filter((l) => l.quantity > 0);
}

/**
 * A merge waiting to be resent never holds more of a part than the phone now does, so a part lowered or removed
 * after a failed merge does not come back; it is never raised. Null once nothing is left to merge.
 */
export function capPending(pending: PendingMerge, line: CartLineInput): PendingMerge | null {
  const lines = pending.cart.items
    .map((l) => (lineKey(l) === lineKey(line) ? { ...l, quantity: Math.min(l.quantity, line.quantity) } : l))
    .filter((l) => l.quantity > 0);
  if (lines.length === 0 && pending.cart.builds.length === 0) return null;
  return { key: pending.key, cart: { ...pending.cart, items: lines } };
}

/**
 * The phone's lines as the API reads them (CartService.resolve): a part no longer sold (null) is dropped, a finish
 * the part no longer has becomes its first finish (or none), and lines that end up the same part and finish are
 * joined, capped at 10. Parts missing from `finishes` are left as they are.
 */
export function reconcile(
  lines: CartLineInput[],
  finishes: ReadonlyMap<string, readonly string[] | null>,
): CartLineInput[] {
  const joined = new Map<string, CartLineInput>();
  for (const l of lines) {
    const known = finishes.get(l.slug);
    if (known === null) continue;
    const colorKey = known === undefined || known.includes(l.colorKey) ? l.colorKey : (known[0] ?? '');
    const key = lineKey({ slug: l.slug, colorKey });
    const quantity = Math.min(MAX_LINE_QUANTITY, (joined.get(key)?.quantity ?? 0) + l.quantity);
    joined.set(key, { slug: l.slug, colorKey, quantity });
  }
  return [...joined.values()];
}
