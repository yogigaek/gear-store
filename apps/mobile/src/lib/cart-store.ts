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
