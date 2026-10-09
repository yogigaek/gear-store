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
