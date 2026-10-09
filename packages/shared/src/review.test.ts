import { describe, expect, it } from 'vitest';
import { publicName, reviewInputSchema } from './review.js';

describe('reviews', () => {
  it.each([
    ['Ana Putri Lestari', 'Ana L.'],
    ['  budi  ', 'budi'],
    ['Siti nurhaliza', 'Siti N.'],
    ['', 'Customer'],
  ])('shows %j as %j', (name, expected) => {
    expect(publicName(name)).toBe(expected);
  });

  it('requires a whole-star rating from 1 to 5 and a real body', () => {
    const ok = { rating: 4, title: 'Solid', body: 'Comfortable for long calls.' };
    expect(reviewInputSchema.safeParse(ok).success).toBe(true);
    expect(reviewInputSchema.safeParse({ ...ok, rating: 0 }).success).toBe(false);
    expect(reviewInputSchema.safeParse({ ...ok, rating: 4.5 }).success).toBe(false);
    expect(reviewInputSchema.safeParse({ ...ok, body: 'ok' }).success).toBe(false);
  });
});
