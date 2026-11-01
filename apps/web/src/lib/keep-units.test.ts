import { describe, expect, it } from 'vitest';
import { keepUnits } from './format';

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

describe('keepUnits edges', () => {
  it.each([
    ['20   mAh', '20\u00a0mAh'],
    ['20\tmAh', '20\u00a0mAh'],
    ['Size M', 'Size M'],
    ['', ''],
    ['10 %', '10\u00a0%'],
    ['90 °', '90\u00a0°'],
    ['5 µm', '5\u00a0µm'],
  ])('%j', (input, expected) => {
    expect(keepUnits(input)).toBe(expected);
  });
});
