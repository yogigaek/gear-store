import { describe, expect, it } from 'vitest';
import { count, formatRupiah, keepUnits } from './format';

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
