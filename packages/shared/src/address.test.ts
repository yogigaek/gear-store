import { describe, expect, it } from 'vitest';
import {
  addressInputSchema,
  addressSchema,
  phoneSchema,
  provinceNames,
  provinces,
  provinceSchema,
  shippingFor,
  shippingZones,
} from './address.js';

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

describe('address boundaries', () => {
  const base = {
    recipient: 'Ana',
    phone: '081234567890',
    line1: 'Jl. 1',
    city: 'Ba',
    province: 'Bali',
    postalCode: '80111',
  };
  const ok = (change: object) => addressInputSchema.safeParse({ ...base, ...change }).success;

  it('fills the optional fields and normalises the phone', () => {
    expect(addressInputSchema.parse(base)).toEqual({
      ...base,
      label: '',
      line2: '',
      isDefault: false,
      phone: '+6281234567890',
    });
  });

  it.each([
    ['label', 30],
    ['recipient', 80],
    ['line1', 200],
    ['line2', 200],
    ['city', 80],
  ])('takes a %s of up to %i characters', (field, max) => {
    expect(ok({ [field]: 'x'.repeat(max) })).toBe(true);
    expect(ok({ [field]: 'x'.repeat(max + 1) })).toBe(false);
  });

  it('needs a recipient, a street of 5 and a city of 2 characters, after trimming', () => {
    expect(ok({ recipient: '   ' })).toBe(false);
    expect(ok({ line1: 'Jl 1' })).toBe(false);
    expect(ok({ line1: '  Jl 1  ' })).toBe(false);
    expect(ok({ city: 'B' })).toBe(false);
  });

  it.each(['2811', '281111', '2811a', '28 111', '', '٢٨١١١'])('refuses postal code %j', (postalCode) => {
    expect(ok({ postalCode })).toBe(false);
  });

  it('trims a postal code', () => {
    expect(addressInputSchema.parse({ ...base, postalCode: ' 80111 ' }).postalCode).toBe('80111');
  });

  it('takes a province by its exact name only', () => {
    expect(provinceSchema.safeParse('Papua Barat Daya').success).toBe(true);
    for (const province of ['bali', 'Bali ', 'Jakarta', 'constructor', ''])
      expect(provinceSchema.safeParse(province).error?.issues[0]?.message).toBe('Choose a province');
  });

  it('puts every province in one of the four zones, and each zone has a province', () => {
    const zones = new Set(Object.values(provinces));
    expect([...zones].sort()).toEqual(Object.keys(shippingZones).sort());
    expect(shippingFor('Bali')).toEqual({ zone: 'B', ...shippingZones.B });
  });

  it.each([
    ['081234567', '+6281234567'],
    ['08123456789012', '+628123456789012'],
    ['(0812) 3456.7890', '+6281234567890'],
  ])('takes the shortest and longest mobile numbers: %s', (input, expected) => {
    expect(phoneSchema.parse(input)).toBe(expected);
  });

  it.each([
    '08123456',
    '081234567890123',
    '0802345678',
    '+62 0812 3456 789',
    '0812345678x',
    '+6281234567890;',
  ])('refuses phone %j', (input) => {
    expect(phoneSchema.safeParse(input).success).toBe(false);
  });

  it('reads a saved address with its id and a whole-rupiah fee', () => {
    const saved = {
      ...addressInputSchema.parse(base),
      id: crypto.randomUUID(),
      shippingFee: 22000,
      shippingEta: '2–3 days',
    };
    expect(addressSchema.safeParse(saved).success).toBe(true);
    expect(addressSchema.safeParse({ ...saved, id: '1' }).success).toBe(false);
    expect(addressSchema.safeParse({ ...saved, shippingFee: -1 }).success).toBe(false);
  });
});
