import { describe, expect, it } from 'vitest';
import { myReviewSchema, productReviewsSchema, publicName, reviewInputSchema } from './review.js';

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

describe('review boundaries', () => {
  const ok = { rating: 5, title: 'T', body: 'x'.repeat(10) };

  it('takes ratings 1 and 5, a title of 1 to 80 and a body of 10 to 2000 characters', () => {
    expect(reviewInputSchema.safeParse({ ...ok, rating: 1 }).success).toBe(true);
    expect(
      reviewInputSchema.safeParse({ ...ok, title: 'x'.repeat(80), body: 'x'.repeat(2000) }).success,
    ).toBe(true);
    expect(reviewInputSchema.safeParse({ ...ok, rating: 6 }).success).toBe(false);
    expect(reviewInputSchema.safeParse({ ...ok, title: 'x'.repeat(81) }).success).toBe(false);
    expect(reviewInputSchema.safeParse({ ...ok, body: 'x'.repeat(2001) }).success).toBe(false);
  });

  it('counts the title and body after trimming', () => {
    expect(reviewInputSchema.safeParse({ ...ok, title: '   ' }).success).toBe(false);
    expect(reviewInputSchema.safeParse({ ...ok, body: `   ${'x'.repeat(9)}   ` }).success).toBe(false);
    expect(reviewInputSchema.parse({ ...ok, title: ' T ' }).title).toBe('T');
  });

  it.each([
    ['   ', 'Customer'],
    ['Ana\tPutri', 'Ana P.'],
    ['ana  maria   putri', 'ana P.'],
    ['Ana é', 'Ana É.'],
  ])('shows %j as %j', (name, expected) => {
    expect(publicName(name)).toBe(expected);
  });

  it('gives five counts, 5 stars first, and names why a review cannot be written', () => {
    const reviews = { average: null, count: 0, distribution: [0, 0, 0, 0, 0], items: [] };
    expect(productReviewsSchema.safeParse(reviews).success).toBe(true);
    expect(productReviewsSchema.safeParse({ ...reviews, distribution: [0, 0, 0, 0] }).success).toBe(false);
    expect(myReviewSchema.safeParse({ canReview: false, reason: 'DEMO_ACCOUNT', review: null }).success).toBe(
      true,
    );
    expect(myReviewSchema.safeParse({ canReview: false, reason: 'BANNED', review: null }).success).toBe(
      false,
    );
  });
});
