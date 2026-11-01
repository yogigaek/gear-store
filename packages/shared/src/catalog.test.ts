import { describe, expect, it } from 'vitest';
import { errorSchema, productQuerySchema } from './catalog.js';

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
