import { describe, expect, it } from 'vitest';
import {
  cartBuildInputSchema,
  cartBuildSchema,
  cartLineInputSchema,
  cartLineSchema,
  cartSchema,
  guestCartSchema,
  MAX_CART_BUILDS,
  MAX_CART_LINES,
  mergeCartResultSchema,
  mergeCartSchema,
  quantityInputSchema,
} from './cart.js';
import { MAX_LINE_QUANTITY } from './build.js';

const line = (quantity: number, slug = 'fender-set') => ({ slug, colorKey: '', quantity });
const build = (quantity = 1) => ({
  parts: { frames: 'e1-frame-m' },
  colorKey: 'signal',
  quantity,
  key: crypto.randomUUID(),
});
const product = {
  slug: 'fender-set',
  name: 'Fender set',
  model: 'FS-1',
  category: 'accessories',
  module: 'ACCESSORY',
  price: 150000,
  stock: 3,
  plate: [],
};
const quote = {
  label: 'E-1',
  colorKey: 'signal',
  colorLabel: 'Signal',
  parts: [],
  unitPrice: 0,
  problems: [],
};

describe('cart line input', () => {
  it('holds 0 (remove) to 10 of a part, whole numbers only', () => {
    expect(MAX_LINE_QUANTITY).toBe(10);
    for (const q of [0, 1, 10]) expect(cartLineInputSchema.safeParse(line(q)).success).toBe(true);
    for (const q of [-1, 11, 1.5, Number.NaN, Infinity])
      expect(cartLineInputSchema.safeParse(line(q)).success).toBe(false);
    expect(cartLineInputSchema.safeParse({ ...line(1), quantity: '1' }).success).toBe(false);
  });

  it('defaults the finish to none and caps its key at 40 characters', () => {
    expect(cartLineInputSchema.parse({ slug: 'fender-set', quantity: 1 }).colorKey).toBe('');
    expect(cartLineInputSchema.safeParse({ ...line(1), colorKey: 'x'.repeat(40) }).success).toBe(true);
    expect(cartLineInputSchema.safeParse({ ...line(1), colorKey: 'x'.repeat(41) }).success).toBe(false);
  });

  it.each(['', 'Fender', '../etc', 'fender_set', 'fender--set', '-fender', 'x'.repeat(81)])(
    'refuses the slug %j',
    (slug) => {
      expect(cartLineInputSchema.safeParse(line(1, slug)).success).toBe(false);
    },
  );

  it('sets a quantity from 0 to 10 on its own', () => {
    expect(quantityInputSchema.safeParse({ quantity: 0 }).success).toBe(true);
    expect(quantityInputSchema.safeParse({ quantity: 10 }).success).toBe(true);
    expect(quantityInputSchema.safeParse({ quantity: 11 }).success).toBe(false);
    expect(quantityInputSchema.safeParse({}).success).toBe(false);
  });
});

describe('bikes in a cart', () => {
  it('adds 1 to 10 of a bike, never 0', () => {
    const { key: _, ...input } = build();
    expect(cartBuildInputSchema.safeParse({ ...input, quantity: 1 }).success).toBe(true);
    expect(cartBuildInputSchema.safeParse({ ...input, quantity: 10 }).success).toBe(true);
    expect(cartBuildInputSchema.safeParse({ ...input, quantity: 0 }).success).toBe(false);
    expect(cartBuildInputSchema.safeParse({ ...input, quantity: 11 }).success).toBe(false);
  });

  it('knows a guest bike only by a UUID key', () => {
    expect(guestCartSchema.safeParse({ items: [], builds: [{ ...build(), key: 'bike-1' }] }).success).toBe(
      false,
    );
  });
});

describe('guest cart', () => {
  it(`holds up to ${MAX_CART_LINES} part lines and ${MAX_CART_BUILDS} bikes`, () => {
    const lines = (n: number) => Array.from({ length: n }, (_, i) => line(1, `part-${i}`));
    const bikes = (n: number) => Array.from({ length: n }, () => build());
    expect(guestCartSchema.safeParse({ items: lines(MAX_CART_LINES) }).success).toBe(true);
    expect(guestCartSchema.safeParse({ items: lines(MAX_CART_LINES + 1) }).success).toBe(false);
    expect(guestCartSchema.safeParse({ items: [], builds: bikes(MAX_CART_BUILDS) }).success).toBe(true);
    expect(guestCartSchema.safeParse({ items: [], builds: bikes(MAX_CART_BUILDS + 1) }).success).toBe(false);
  });

  it('needs its items list, and refuses anything that is not a cart', () => {
    for (const value of [null, undefined, [], 'cart', { builds: [] }, { items: {} }])
      expect(guestCartSchema.safeParse(value).success).toBe(false);
  });

  it('names a merge by an optional UUID only', () => {
    expect(mergeCartSchema.safeParse({ items: [] }).success).toBe(true);
    expect(mergeCartSchema.safeParse({ items: [], mergeKey: crypto.randomUUID() }).success).toBe(true);
    for (const mergeKey of ['', 'merge-1', `${crypto.randomUUID()} `, null])
      expect(mergeCartSchema.safeParse({ items: [], mergeKey }).success).toBe(false);
  });
});

describe('priced cart', () => {
  const priced = { product, colorKey: '', colorLabel: null, quantity: 1, lineTotal: 150000, problem: null };

  it('names a part line problem as out of stock or short, never "cannot build"', () => {
    for (const problem of ['OUT_OF_STOCK', 'NOT_ENOUGH_STOCK', null])
      expect(cartLineSchema.safeParse({ ...priced, problem }).success).toBe(true);
    expect(cartLineSchema.safeParse({ ...priced, problem: 'CANNOT_BUILD' }).success).toBe(false);
    expect(cartLineSchema.safeParse({ ...priced, quantity: 0 }).success).toBe(false);
    expect(cartLineSchema.safeParse({ ...priced, lineTotal: -1 }).success).toBe(false);
  });

  it('lets a bike line say it can no longer be built', () => {
    const bike = { id: 'b1', quote, quantity: 2, lineTotal: 0 };
    for (const problem of ['OUT_OF_STOCK', 'NOT_ENOUGH_STOCK', 'CANNOT_BUILD', null])
      expect(cartBuildSchema.safeParse({ ...bike, problem }).success).toBe(true);
    expect(cartBuildSchema.safeParse({ ...bike, problem: 'BROKEN' }).success).toBe(false);
  });

  it('counts whole, non-negative money and items', () => {
    const cart = { items: [], builds: [], subtotal: 0, itemCount: 0, canCheckout: false };
    expect(cartSchema.safeParse(cart).success).toBe(true);
    expect(cartSchema.safeParse({ ...cart, subtotal: 0.5 }).success).toBe(false);
    expect(cartSchema.safeParse({ ...cart, itemCount: -1 }).success).toBe(false);
  });

  it('reports what a merge left out as a total that can pass one line’s limit', () => {
    const cart = { items: [], builds: [], subtotal: 0, itemCount: 0, canCheckout: false };
    expect(mergeCartResultSchema.safeParse({ ...cart, notMerged: [line(14)] }).success).toBe(true);
    expect(mergeCartResultSchema.safeParse({ ...cart, notMerged: [line(0)] }).success).toBe(false);
    expect(mergeCartResultSchema.safeParse(cart).success).toBe(false);
  });
});
