import { MAX_LINE_QUANTITY, productSlugSchema, type CartLineInput } from '@gear-store/shared';

type Param = string | string[] | undefined;

/** the route params of a Buy now: `buy` (the part's slug), `finish` (its key, left out for none) and `qty` */
export interface BuyParams {
  [key: string]: string | undefined;
  buy: string;
  finish?: string;
  qty: string;
}

// a finish key as the catalogue writes them ("signal", "graphite"): short, lowercase, no room for anything else
const FINISH = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * The one line a Buy now orders, read from route params that can arrive from outside the app (rakit:// links):
 * a valid slug, a short finish key or none, and a quantity of 1–10 (1 when not given). Anything else is no line.
 */
export function parseBuyLine({
  buy,
  finish,
  qty,
}: {
  buy?: Param;
  finish?: Param;
  qty?: Param;
}): CartLineInput | null {
  if (typeof buy !== 'string' || !productSlugSchema.safeParse(buy).success) return null;
  const colorKey = finish === undefined || finish === '' ? '' : finish;
  if (typeof colorKey !== 'string' || (colorKey !== '' && (colorKey.length > 40 || !FINISH.test(colorKey)))) {
    return null;
  }
  if (qty !== undefined && (typeof qty !== 'string' || !/^\d{1,2}$/.test(qty))) return null;
  const quantity = qty === undefined ? 1 : Number(qty);
  if (quantity < 1 || quantity > MAX_LINE_QUANTITY) return null;
  return { slug: buy, colorKey, quantity };
}

/** the params that bring `line` back through parseBuyLine */
export function buyParams(line: CartLineInput): BuyParams {
  return {
    buy: line.slug,
    ...(line.colorKey ? { finish: line.colorKey } : {}),
    qty: String(line.quantity),
  };
}
