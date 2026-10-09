import { z } from 'zod';
import { productSlugSchema, productSummarySchema, rupiahSchema } from './catalog.js';

/** Most of one product a single order can hold; stops a typo from becoming a 1000-unit order. */
export const MAX_LINE_QUANTITY = 10;
export const MAX_CART_LINES = 50;

export const cartLineInputSchema = z.object({
  slug: productSlugSchema,
  /** the chosen finish; empty for products without finishes */
  colorKey: z.string().max(40).default(''),
  quantity: z.number().int().min(0).max(MAX_LINE_QUANTITY),
});
export type CartLineInput = z.infer<typeof cartLineInputSchema>;

export const cartLinesSchema = z.object({ items: z.array(cartLineInputSchema).max(MAX_CART_LINES) });
export type CartLines = z.infer<typeof cartLinesSchema>;

export const cartProblems = ['OUT_OF_STOCK', 'NOT_ENOUGH_STOCK'] as const;

export const cartLineSchema = z.object({
  product: productSummarySchema,
  colorKey: z.string(),
  colorLabel: z.string().nullable(),
  quantity: z.number().int().positive(),
  /** price × quantity at today's price, computed by the server */
  lineTotal: rupiahSchema,
  problem: z.enum(cartProblems).nullable(),
});
export type CartLine = z.infer<typeof cartLineSchema>;

export const cartSchema = z.object({
  items: z.array(cartLineSchema),
  subtotal: rupiahSchema,
  itemCount: z.number().int().nonnegative(),
  /** false while any line is out of stock or over the available stock */
  canCheckout: z.boolean(),
});
export type Cart = z.infer<typeof cartSchema>;
