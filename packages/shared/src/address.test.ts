import { describe, expect, it } from 'vitest';
import { addressInputSchema, phoneSchema, provinceNames, shippingFor } from './address.js';

describe('address', () => {
  it('lists the 38 provinces, each in a zone', () => {
    expect(provinceNames).toHaveLength(38);
    for (const p of provinceNames) expect(shippingFor(p).fee).toBeGreaterThan(0);
  });

  it('prices by zone', () => {
    expect(shippingFor('DKI Jakarta')).toMatchObject({ zone: 'A', fee: 15000 });
    expect(shippingFor('Papua Pegunungan')).toMatchObject({ zone: 'D', fee: 55000 });
  });

  it.each([
    ['0812 3456 7890', '+6281234567890'],
    ['+62 812-3456-789', '+628123456789'],
    ['6285712345678', '+6285712345678'],
  ])('normalises phone %s', (input, expected) => {
    expect(phoneSchema.parse(input)).toBe(expected);
  });

  it.each(['021 555 1234', '0812', '+1 415 555 0100', '08001234567'])('rejects phone %s', (input) => {
    expect(phoneSchema.safeParse(input).success).toBe(false);
  });

  it('requires a five-digit postal code and a known province', () => {
    const base = {
      recipient: 'Ana',
      phone: '081234567890',
      line1: 'Jl. Sudirman No. 1',
      city: 'Pekanbaru',
      province: 'Riau',
      postalCode: '28111',
    };
    expect(addressInputSchema.safeParse(base).success).toBe(true);
    expect(addressInputSchema.safeParse({ ...base, postalCode: '2811' }).success).toBe(false);
    expect(addressInputSchema.safeParse({ ...base, province: 'Atlantis' }).success).toBe(false);
  });
});
