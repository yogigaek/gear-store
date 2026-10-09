import { z } from 'zod';

export const reviewInputSchema = z.object({
  rating: z.number().int().min(1, 'Choose a rating').max(5),
  title: z.string().trim().min(1, 'Give the review a title').max(80, 'Use at most 80 characters'),
  body: z.string().trim().min(10, 'Write at least 10 characters').max(2000, 'Use at most 2000 characters'),
});
export type ReviewInput = z.infer<typeof reviewInputSchema>;

export const reviewSchema = z.object({
  id: z.uuid(),
  /** first name and last initial only: "Ana P." */
  author: z.string(),
  rating: z.number().int().min(1).max(5),
  title: z.string(),
  body: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Review = z.infer<typeof reviewSchema>;

export const productReviewsSchema = z.object({
  average: z.number().nullable(),
  count: z.number().int().nonnegative(),
  /** how many reviews gave 5, 4, 3, 2 and 1 stars, in that order */
  distribution: z.tuple([z.number(), z.number(), z.number(), z.number(), z.number()]),
  items: z.array(reviewSchema),
});
export type ProductReviews = z.infer<typeof productReviewsSchema>;

export const myReviewSchema = z.object({
  /** bought and paid for, and not a shared demo account */
  canReview: z.boolean(),
  reason: z.enum(['NOT_PURCHASED', 'DEMO_ACCOUNT']).nullable(),
  review: reviewSchema.nullable(),
});
export type MyReview = z.infer<typeof myReviewSchema>;

/** "Ana Putri Lestari" → "Ana L." */
export function publicName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'Customer';
  const first = parts[0]!;
  return parts.length === 1 ? first : `${first} ${parts.at(-1)![0]!.toUpperCase()}.`;
}
