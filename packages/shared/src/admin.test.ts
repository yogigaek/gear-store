import { describe, expect, it } from 'vitest';
import {
  adminCategoryInputSchema,
  adminListQuerySchema,
  adminOrderQuerySchema,
  adminProductInputSchema,
  adminProductUpdateSchema,
  adminStatsQuerySchema,
  adminUserRowSchema,
  pageOf,
  roleInputSchema,
  shipInputSchema,
} from './admin.js';
import { z } from 'zod';

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

describe('admin boundaries', () => {
  const ok = (change: object) => adminProductInputSchema.safeParse({ ...product, ...change }).success;
  const spec = { label: 'A', value: '1' };
  const color = (key: string) => ({ key, label: key, hex: '#000000' });

  it.each([
    ['name', 2, 80],
    ['model', 1, 20],
    ['description', 10, 2000],
  ])('takes a product %s of %i to %i characters', (field, min, max) => {
    expect(ok({ [field]: 'x'.repeat(min) })).toBe(true);
    expect(ok({ [field]: 'x'.repeat(max) })).toBe(true);
    expect(ok({ [field]: 'x'.repeat(min - 1) })).toBe(false);
    expect(ok({ [field]: 'x'.repeat(max + 1) })).toBe(false);
  });

  it('prices from Rp 1.000 to Rp 1.000.000.000, and stocks 0 to 100.000', () => {
    expect(ok({ price: 1000 })).toBe(true);
    expect(ok({ price: 999 })).toBe(false);
    expect(ok({ price: 1_000_000_000 })).toBe(true);
    expect(ok({ price: 1_000_000_001 })).toBe(false);
    expect(ok({ stock: 0 })).toBe(true);
    expect(ok({ stock: -1 })).toBe(false);
    expect(ok({ stock: 100_000 })).toBe(true);
    expect(ok({ stock: 100_001 })).toBe(false);
  });

  it('takes 3 to 20 specs and up to 8 finishes', () => {
    expect(ok({ specs: Array(20).fill(spec) })).toBe(true);
    expect(ok({ specs: Array(21).fill(spec) })).toBe(false);
    expect(ok({ specs: [spec, spec, { label: 'x'.repeat(41), value: '1' }] })).toBe(false);
    expect(ok({ specs: [spec, spec, { label: 'C', value: 'x'.repeat(81) }] })).toBe(false);
    expect(ok({ specs: [spec, spec, { label: ' ', value: '1' }] })).toBe(false);
    const keys = 'abcdefghi'.split('');
    expect(ok({ colors: keys.slice(0, 8).map(color) })).toBe(true);
    expect(ok({ colors: keys.map(color) })).toBe(false);
  });

  it('names a missing part type, and refuses one that is not a slug', () => {
    expect(adminProductInputSchema.safeParse({ ...product, category: '' }).error?.issues[0]?.message).toBe(
      'Choose a part type',
    );
    expect(ok({ category: 'Batteries' })).toBe(false);
    expect(ok({ slug: '  x-1-test  ' })).toBe(true);
  });

  it('saves an edit only with the ISO time it was opened at', () => {
    const update = { ...product, expectedUpdatedAt: '2026-10-31T10:00:00.000Z' };
    expect(adminProductUpdateSchema.safeParse(update).success).toBe(true);
    expect(adminProductUpdateSchema.safeParse({ ...update, expectedUpdatedAt: 'yesterday' }).success).toBe(
      false,
    );
    expect(adminProductUpdateSchema.safeParse(product).success).toBe(false);
  });

  it('takes category names, descriptions, order and build slot within their ranges', () => {
    const category = { slug: 'frames', name: 'Fr', description: 'Fr', sortOrder: 0, slot: null };
    const okCategory = (change: object) =>
      adminCategoryInputSchema.safeParse({ ...category, ...change }).success;
    expect(okCategory({})).toBe(true);
    expect(
      okCategory({ name: 'x'.repeat(40), description: 'x'.repeat(120), sortOrder: 1000, slot: 20 }),
    ).toBe(true);
    for (const change of [
      { name: 'x' },
      { name: 'x'.repeat(41) },
      { description: 'x' },
      { description: 'x'.repeat(121) },
      { sortOrder: -1 },
      { sortOrder: 1001 },
      { slot: -1 },
      { slot: 21 },
    ])
      expect(okCategory(change)).toBe(false);
  });

  it('pages lists from 1 to 1000, 1 to 100 rows at a time', () => {
    expect(adminListQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(adminListQuerySchema.parse({ page: '1000', pageSize: '100', q: ' ana ' })).toEqual({
      page: 1000,
      pageSize: 100,
      q: 'ana',
    });
    for (const query of [{ page: '0' }, { page: '1001' }, { pageSize: '101' }, { q: 'x'.repeat(81) }])
      expect(adminListQuerySchema.safeParse(query).success).toBe(false);
    const page = pageOf(z.string());
    expect(page.parse({ items: ['a'], page: 1, pageSize: 20, total: 1 }).items).toEqual(['a']);
    expect(page.safeParse({ items: [1], page: 1, pageSize: 20, total: 1 }).success).toBe(false);
  });

  it('filters orders by a known status and by refunds needed only', () => {
    expect(adminOrderQuerySchema.parse({ status: 'PAID', refund: 'needed' })).toMatchObject({
      status: 'PAID',
      refund: 'needed',
    });
    expect(adminOrderQuerySchema.safeParse({ status: 'paid' }).success).toBe(false);
    expect(adminOrderQuerySchema.safeParse({ refund: 'done' }).success).toBe(false);
  });

  it('takes tracking numbers of 6 to 40 letters, digits or hyphens', () => {
    const ship = (trackingNumber: string) =>
      shipInputSchema.safeParse({ courier: 'JNE', trackingNumber }).success;
    expect(ship('ABC-12')).toBe(true);
    expect(ship('X'.repeat(40))).toBe(true);
    for (const t of ['ABC12', 'X'.repeat(41), 'JP 123456', 'JP123456;', '<script>'])
      expect(ship(t)).toBe(false);
    expect(
      shipInputSchema.safeParse({ courier: '', trackingNumber: 'ABC-12' }).error?.issues[0]?.message,
    ).toBe('Choose a courier');
  });

  it('refuses a stats range that is not a number', () => {
    expect(adminStatsQuerySchema.safeParse({ days: 'abc' }).success).toBe(false);
    expect(adminStatsQuerySchema.parse({ days: 90 }).days).toBe(90);
  });

  it('sets a role to one of the two roles, for a user known by UUID', () => {
    expect(roleInputSchema.safeParse({ role: 'ADMIN' }).success).toBe(true);
    expect(roleInputSchema.safeParse({ role: 'admin' }).success).toBe(false);
    const row = {
      id: crypto.randomUUID(),
      email: 'a@b.co',
      name: 'A',
      role: 'CUSTOMER',
      emailVerified: true,
      isDemo: false,
      orderCount: 0,
      createdAt: 'x',
    };
    expect(adminUserRowSchema.safeParse(row).success).toBe(true);
    expect(adminUserRowSchema.safeParse({ ...row, id: '1' }).success).toBe(false);
  });
});
