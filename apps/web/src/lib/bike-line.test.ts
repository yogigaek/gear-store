import { describe, expect, it } from 'vitest';
import { bike } from '../test/fixtures';
import { bikeLine, NO_PRICE_YET } from './bike-line';

describe('bikeLine', () => {
  it('prices a bike that can be built, each and in all', () => {
    expect(bikeLine(bike())).toEqual({
      key: 'bike:b1',
      name: 'E-1 trail',
      what: '2 parts',
      finish: 'Signal yellow',
      quantity: 1,
      unitPrice: 30_000_000,
      lineTotal: 30_000_000,
    });
  });

  it('shows the price of one bike and the total of several', () => {
    expect(bikeLine(bike({ quantity: 3, lineTotal: 90_000_000 }))).toMatchObject({
      quantity: 3,
      unitPrice: 30_000_000,
      lineTotal: 90_000_000,
    });
  });

  it.each(['OUT_OF_STOCK', 'NOT_ENOUGH_STOCK'] as const)('keeps the price of a bike %s', (problem) => {
    expect(bikeLine(bike({ problem }))).toMatchObject({ unitPrice: 30_000_000, lineTotal: 30_000_000 });
  });

  it('gives no price to a bike that can no longer be built', () => {
    expect(bikeLine(bike({ problem: 'CANNOT_BUILD', quantity: 2 }))).toMatchObject({
      quantity: 2,
      unitPrice: null,
      lineTotal: null,
    });
    expect(NO_PRICE_YET).toBe('No price until it can be built');
  });

  it('counts one part as "1 part", and a bike without a finish shows none', () => {
    const one = bike();
    one.quote = { ...one.quote, parts: one.quote.parts.slice(0, 1), colorLabel: null };
    expect(bikeLine(one)).toMatchObject({ what: '1 part', finish: null });
  });
});
