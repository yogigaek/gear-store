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

describe('formatRupiah boundaries', () => {
  it('groups the largest product price and rounds half a rupiah up', () => {
    expect(formatRupiah(1_000_000_000)).toBe('Rp 1.000.000.000');
    expect(formatRupiah(0.5)).toBe('Rp 1');
    expect(formatRupiah(0.49)).toBe('Rp 0');
    // a plain space after Rp, as the existing rows show, never a no-break one
    expect(formatRupiah(1)).toBe('Rp 1');
  });
});
