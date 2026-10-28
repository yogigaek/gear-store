import { MAX_LINE_QUANTITY, productSlugSchema, type CartLineInput } from '@gear-store/shared';

// a finish key as the catalogue writes them ("signal", "graphite"): short, lowercase, no room for anything else
const FINISH = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** a query parameter as one value: missing → undefined, given twice → null (a link is refused, never guessed) */
function single(params: URLSearchParams, name: string): string | undefined | null {
  const values = params.getAll(name);
  if (values.length > 1) return null;
  return values[0];
}

/** The line a Buy now orders, by the mobile app's rules: a valid slug, a finish key or none, 1–10 (default 1). */
export function parseBuyLine(params: URLSearchParams): CartLineInput | null {
  const buy = single(params, 'buy');
  const finish = single(params, 'finish');
  const qty = single(params, 'qty');
  if (typeof buy !== 'string' || !productSlugSchema.safeParse(buy).success) return null;
  if (finish === null || (finish && (finish.length > 40 || !FINISH.test(finish)))) return null;
  if (qty === null || (qty !== undefined && !/^\d{1,2}$/.test(qty))) return null;
  const quantity = qty === undefined ? 1 : Number(qty);
  if (quantity < 1 || quantity > MAX_LINE_QUANTITY) return null;
  return { slug: buy, colorKey: finish ?? '', quantity };
}

/** the checkout that buys `line` on its own; parseBuyLine reads it back */
export function buyNowPath(line: CartLineInput): string {
  const params = new URLSearchParams({ buy: line.slug });
  if (line.colorKey) params.set('finish', line.colorKey);
  params.set('qty', String(line.quantity));
  return `/checkout?${params}`;
}
