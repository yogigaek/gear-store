import { describe, expect, it } from 'vitest';
import { bikeLineTotal, bikeTotalText, bikeUnitText, NO_PRICE_YET } from './bike-line';

const bike = (change: {
  problem?: 'OUT_OF_STOCK' | 'NOT_ENOUGH_STOCK' | 'CANNOT_BUILD' | null;
  quantity?: number;
}) => {
  const quantity = change.quantity ?? 1;
  return {
    problem: change.problem ?? null,
    quantity,
    lineTotal: 30_000_000 * quantity,
    quote: { unitPrice: 30_000_000 },
  };
};

describe('a bike’s price in the cart and at checkout', () => {
  it('prices a bike that can be built', () => {
    expect(bikeLineTotal(bike({}))).toBe(30_000_000);
    expect(bikeUnitText(bike({}))).toBe('1 × Rp 30.000.000');
    expect(bikeTotalText(bike({}))).toBe('Rp 30.000.000');
  });

  it('shows the price of one and the total of several', () => {
    const three = bike({ quantity: 3 });
    expect(bikeUnitText(three)).toBe('3 × Rp 30.000.000');
    expect(bikeTotalText(three)).toBe('Rp 90.000.000');
    expect(bikeLineTotal(three)).toBe(90_000_000);
  });

  it.each(['OUT_OF_STOCK', 'NOT_ENOUGH_STOCK'] as const)('keeps the price of a bike %s', (problem) => {
    expect(bikeLineTotal(bike({ problem }))).toBe(30_000_000);
    expect(bikeUnitText(bike({ problem }))).toBe('1 × Rp 30.000.000');
  });

  it('gives no price and no total to a bike that can no longer be built', () => {
    const broken = bike({ problem: 'CANNOT_BUILD', quantity: 2 });
    expect(bikeLineTotal(broken)).toBeNull();
    expect(bikeUnitText(broken)).toBe(NO_PRICE_YET);
    expect(bikeTotalText(broken)).toBe('');
    expect(NO_PRICE_YET).toBe('No price until it can be built');
  });
});
