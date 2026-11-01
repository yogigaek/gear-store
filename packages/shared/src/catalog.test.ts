import { describe, expect, it } from 'vitest';
import {
  categorySchema,
  colorSchema,
  errorSchema,
  productQuerySchema,
  productSlugSchema,
  productSummarySchema,
  WISHLIST_LIMIT,
} from './catalog.js';

describe('productQuerySchema', () => {
  it('applies defaults to an empty query', () => {
    expect(productQuerySchema.parse({})).toEqual({ sort: 'type', page: 1, pageSize: 12 });
  });

  it('coerces query-string numbers and booleans', () => {
    const q = productQuerySchema.parse({ minPrice: '100000', page: '2', inStock: 'true' });
    expect(q).toMatchObject({ minPrice: 100000, page: 2, inStock: true });
  });

  it.each([
    [{ pageSize: '500' }, 'pageSize'],
    [{ minPrice: '-1' }, 'minPrice'],
    [{ minPrice: '1.5' }, 'minPrice'],
    [{ category: 'Audio; DROP' }, 'category'],
    [{ sort: 'random' }, 'sort'],
    [{ minPrice: '500', maxPrice: '100' }, 'minPrice'],
  ])('rejects %o', (input, field) => {
    const result = productQuerySchema.safeParse(input);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toContain(field);
  });
});

describe('errorSchema', () => {
  it('keeps the code and the wait that a client acts on', () => {
    const paused = {
      statusCode: 429,
      message: 'Too many failed sign-ins.',
      code: 'SIGN_IN_PAUSED',
      retryAfter: 30,
    };
    expect(errorSchema.parse(paused)).toEqual(paused);
  });
});

describe('catalogue boundaries', () => {
  it('takes a slug of 1 to 80 lowercase letters, digits and single hyphens', () => {
    expect(productSlugSchema.safeParse('a').success).toBe(true);
    expect(productSlugSchema.safeParse('x'.repeat(80)).success).toBe(true);
    expect(productSlugSchema.safeParse('e1-frame-m').success).toBe(true);
  });

  it.each(['', 'x'.repeat(81), 'A', 'a--b', '-a', 'a-', 'a_b', 'a b', 'a/b', '..', 'a\nb', 'ä'])(
    'refuses slug %j',
    (slug) => {
      expect(productSlugSchema.safeParse(slug).success).toBe(false);
    },
  );

  it.each([
    [
      { page: '1000', pageSize: '48' },
      { page: 1000, pageSize: 48 },
    ],
    [
      { page: '1', pageSize: '1' },
      { page: 1, pageSize: 1 },
    ],
    [
      { minPrice: '0', maxPrice: '0' },
      { minPrice: 0, maxPrice: 0 },
    ],
    [{ q: '  frame  ' }, { q: 'frame' }],
    [{ q: 'x'.repeat(80) }, { q: 'x'.repeat(80) }],
    [{ inStock: 'false' }, { inStock: false }],
    [{ sort: 'price-desc' }, { sort: 'price-desc' }],
  ])('reads the edge %o', (input, expected) => {
    expect(productQuerySchema.parse(input)).toMatchObject(expected);
  });

  it.each([
    [{ page: '0' }, 'page'],
    [{ page: '1001' }, 'page'],
    [{ page: '1.5' }, 'page'],
    [{ pageSize: '0' }, 'pageSize'],
    [{ pageSize: '49' }, 'pageSize'],
    [{ q: '   ' }, 'q'],
    [{ q: 'x'.repeat(81) }, 'q'],
    [{ inStock: 'maybe' }, 'inStock'],
    [{ maxPrice: 'abc' }, 'maxPrice'],
    [{ category: '' }, 'category'],
  ])('refuses %o', (input, field) => {
    expect(productQuerySchema.safeParse(input).error?.issues[0]?.path).toContain(field);
  });

  it('prints at most three specs on a card plate', () => {
    const product = {
      slug: 'fender-set',
      name: 'Fender set',
      model: 'FS-1',
      category: 'accessories',
      module: 'ACCESSORY',
      price: 0,
      stock: 0,
      plate: [],
    };
    const spec = { label: 'Weight', value: '300 g' };
    expect(productSummarySchema.safeParse({ ...product, plate: [spec, spec, spec] }).success).toBe(true);
    expect(productSummarySchema.safeParse({ ...product, plate: [spec, spec, spec, spec] }).success).toBe(
      false,
    );
    expect(productSummarySchema.safeParse({ ...product, module: 'WING' }).success).toBe(false);
    expect(productSummarySchema.safeParse({ ...product, stock: -1 }).success).toBe(false);
  });

  it('takes a six-digit hex colour in either case', () => {
    for (const hex of ['#24292c', '#ABCDEF'])
      expect(colorSchema.safeParse({ key: 'k', label: 'l', hex }).success).toBe(true);
    for (const hex of ['#fff', '24292c', '#24292g', '#24292c0'])
      expect(colorSchema.safeParse({ key: 'k', label: 'l', hex }).success).toBe(false);
  });

  it('places a category in the build, or nowhere for accessories', () => {
    const category = { slug: 'frames', name: 'Frames', description: '', slot: 0, productCount: 0 };
    expect(categorySchema.safeParse(category).success).toBe(true);
    expect(categorySchema.safeParse({ ...category, slot: null }).success).toBe(true);
    expect(categorySchema.safeParse({ ...category, slot: -1 }).success).toBe(false);
  });

  it('keeps a whole-second wait only, and caps a wishlist', () => {
    expect(errorSchema.safeParse({ statusCode: 429, message: 'x', retryAfter: 1.5 }).success).toBe(false);
    expect(errorSchema.safeParse({ statusCode: 400, message: 'x' }).success).toBe(true);
    expect(WISHLIST_LIMIT).toBe(100);
  });
});
