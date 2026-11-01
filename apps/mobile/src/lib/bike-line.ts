import type { CartBuild } from '@gear-store/shared';
import { formatRupiah, unitLine } from './format';

type Bike = Pick<CartBuild, 'problem' | 'quantity' | 'lineTotal'> & {
  quote: Pick<CartBuild['quote'], 'unitPrice'>;
};

/** what checkout shows in place of a price for a bike that can no longer be built, as on the web */
export const NO_PRICE_YET = 'No price until it can be built';

/** a bike's line total; null for one that can no longer be built: it has no price until it is built again */
export function bikeLineTotal(b: Bike): number | null {
  return b.problem === 'CANNOT_BUILD' ? null : b.lineTotal;
}

/** "2 × Rp 30.000.000", or NO_PRICE_YET */
export function bikeUnitText(b: Bike): string {
  return bikeLineTotal(b) === null ? NO_PRICE_YET : unitLine(b.quantity, b.quote.unitPrice);
}

/** the line total as checkout writes it, empty for a bike without a price */
export function bikeTotalText(b: Bike): string {
  const total = bikeLineTotal(b);
  return total === null ? '' : formatRupiah(total);
}
