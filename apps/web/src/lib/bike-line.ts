import type { CartBuild } from '@gear-store/shared';

/** what an order summary shows in place of a price for a bike that can no longer be built */
export const NO_PRICE_YET = 'No price until it can be built';

/**
 * A bike's row in an order summary, without its picture. A bike that can no longer be built has no price until it
 * is built again; one short of stock keeps its price (its problem is shown elsewhere).
 */
export function bikeLine(b: CartBuild) {
  const priced = b.problem !== 'CANNOT_BUILD';
  return {
    key: `bike:${b.id}`,
    name: b.quote.label,
    what: `${b.quote.parts.length} ${b.quote.parts.length === 1 ? 'part' : 'parts'}`,
    finish: b.quote.colorLabel,
    quantity: b.quantity,
    unitPrice: priced ? b.quote.unitPrice : null,
    lineTotal: priced ? b.lineTotal : null,
  };
}
