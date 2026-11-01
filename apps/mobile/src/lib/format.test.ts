import { describe, expect, it } from 'vitest';
import { count, formatRupiah, keepUnits, lineDetail, unitLine } from './format';

// the same cases as the web's format.test.ts and keep-units.test.ts: both apps print figures alike
describe('formatRupiah', () => {
  it.each([
    [1249000, 'Rp 1.249.000'],
    [0, 'Rp 0'],
    [1249999.6, 'Rp 1.250.000'],
  ])('%d → %s, with a plain space', (amount, expected) => {
    expect(formatRupiah(amount)).toBe(expected);
  });
});

describe('keepUnits', () => {
  it.each([
    ['20.000 mAh', '20.000 mAh'],
    ['125 mW @ 32 Ω', '125 mW @ 32 Ω'],
    ['32-bit / 384 kHz', '32-bit / 384 kHz'],
    ['Hot-swap', 'Hot-swap'],
    ['2 × 4K60', '2 × 4K60'],
  ])('%s', (input, expected) => {
    expect(keepUnits(input)).toBe(expected);
  });
});

describe('count', () => {
  it.each([
    [0, '0 items'],
    [1, '1 item'],
    [2, '2 items'],
  ])('%d', (n, expected) => {
    expect(count(n, 'item')).toBe(expected);
  });
});

describe('lineDetail', () => {
  it('names the model and finish, leaving out a finish the part does not have', () => {
    expect(lineDetail('E1-FR-M', 'Signal yellow')).toBe('E1-FR-M · Signal yellow');
    expect(lineDetail('E1-LK', null)).toBe('E1-LK');
    expect(lineDetail('E1-LK', '')).toBe('E1-LK');
  });

  it('gives the quantity at the price of one', () => {
    expect(unitLine(2, 650000)).toBe('2 × Rp 650.000');
  });
});

describe('format edges', () => {
  it('groups the largest product price and rounds half a rupiah up', () => {
    expect(formatRupiah(1_000_000_000)).toBe('Rp 1.000.000.000');
    expect(formatRupiah(0.5)).toBe('Rp 1');
    expect(unitLine(10, 1_000_000_000)).toBe('10 × Rp 1.000.000.000');
  });

  it.each([
    ['20   mAh', '20 mAh'],
    ['20\tmAh', '20 mAh'],
    ['Size M', 'Size M'],
    ['', ''],
  ])('keeps units with %j', (input, expected) => {
    expect(keepUnits(input)).toBe(expected);
  });

  it('counts a negative or large number as plural', () => {
    expect(count(-1, 'part')).toBe('-1 parts');
    expect(count(50, 'part')).toBe('50 parts');
  });
});
