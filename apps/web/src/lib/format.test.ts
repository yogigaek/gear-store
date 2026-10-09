import { describe, expect, it } from 'vitest';
import { formatRupiah } from './format';

describe('formatRupiah', () => {
  it.each([
    [1249000, 'Rp 1.249.000'],
    [0, 'Rp 0'],
    [459000, 'Rp 459.000'],
    [1249999.6, 'Rp 1.250.000'],
  ])('%d → %s', (amount, expected) => {
    expect(formatRupiah(amount)).toBe(expected);
  });
});
