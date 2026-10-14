import { describe, expect, it } from 'vitest';
import { adminProductInputSchema, adminStatsQuerySchema, shipInputSchema } from './admin.js';

const product = {
  slug: 'x-1-test',
  name: 'Test part',
  model: 'X-1',
  category: 'batteries',
  module: 'BATTERY',
  description: 'A part used in tests.',
  price: 150000,
  stock: 3,
  isActive: true,
  specs: [
    { label: 'A', value: '1' },
    { label: 'B', value: '2' },
    { label: 'C', value: '3' },
  ],
  colors: [],
};

describe('admin schemas', () => {
  it('accepts a complete product and needs three specs for the plate', () => {
    expect(adminProductInputSchema.safeParse(product).success).toBe(true);
    expect(adminProductInputSchema.safeParse({ ...product, specs: product.specs.slice(0, 2) }).success).toBe(
      false,
    );
  });

  it('rejects duplicate finish keys, bad colours, bad slugs and fractional prices', () => {
    const color = { key: 'black', label: 'Black', hex: '#000000' };
    expect(adminProductInputSchema.safeParse({ ...product, colors: [color, color] }).success).toBe(false);
    expect(
      adminProductInputSchema.safeParse({ ...product, colors: [{ ...color, hex: 'black' }] }).success,
    ).toBe(false);
    expect(adminProductInputSchema.safeParse({ ...product, slug: 'Bad Slug' }).success).toBe(false);
    expect(adminProductInputSchema.safeParse({ ...product, price: 1500.5 }).success).toBe(false);
  });

  it('normalises tracking numbers and only knows listed couriers', () => {
    expect(shipInputSchema.parse({ courier: 'JNE', trackingNumber: ' jp1234567890 ' }).trackingNumber).toBe(
      'JP1234567890',
    );
    expect(shipInputSchema.safeParse({ courier: 'FedEx', trackingNumber: 'JP1234567890' }).success).toBe(
      false,
    );
    expect(shipInputSchema.safeParse({ courier: 'JNE', trackingNumber: 'abc' }).success).toBe(false);
  });

  it('allows only the offered stat ranges', () => {
    expect(adminStatsQuerySchema.parse({}).days).toBe(30);
    expect(adminStatsQuerySchema.parse({ days: '7' }).days).toBe(7);
    expect(adminStatsQuerySchema.safeParse({ days: '365' }).success).toBe(false);
  });
});
