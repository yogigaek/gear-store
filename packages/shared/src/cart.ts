import { z } from 'zod';
import { MAX_LINE_QUANTITY, buildQuoteSchema, buildSelectionSchema } from './build.js';
import { productSlugSchema, productSummarySchema, rupiahSchema } from './catalog.js';

export const MAX_CART_LINES = 50;
export const MAX_CART_BUILDS = 5;

export const cartLineInputSchema = z.object({
  slug: productSlugSchema,
  /** the chosen finish; empty for parts without finishes */
  colorKey: z.string().max(40).default(''),
  quantity: z.number().int().min(0).max(MAX_LINE_QUANTITY),
});
export type CartLineInput = z.infer<typeof cartLineInputSchema>;

export const cartBuildInputSchema = buildSelectionSchema.extend({
  quantity: z.number().int().min(1).max(MAX_LINE_QUANTITY),
});
export type CartBuildInput = z.infer<typeof cartBuildInputSchema>;

/** A build held by a guest's browser: the key lets the browser change or remove it after a quote. */
export const guestBuildSchema = cartBuildInputSchema.extend({ key: z.uuid() });
export type GuestBuild = z.infer<typeof guestBuildSchema>;

/** What a guest's browser holds, sent to be priced (and merged into the account on sign-in). */
export const guestCartSchema = z.object({
  items: z.array(cartLineInputSchema).max(MAX_CART_LINES),
  builds: z.array(guestBuildSchema).max(MAX_CART_BUILDS).default([]),
});
export type GuestCart = z.infer<typeof guestCartSchema>;

export const quantityInputSchema = z.object({ quantity: z.number().int().min(0).max(MAX_LINE_QUANTITY) });
export type QuantityInput = z.infer<typeof quantityInputSchema>;

export const cartProblems = ['OUT_OF_STOCK', 'NOT_ENOUGH_STOCK'] as const;
export const cartBuildProblems = [...cartProblems, 'CANNOT_BUILD'] as const;

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

export const cartBuildSchema = z.object({
  /** the saved build's id for an account; the browser's key for a guest */
  id: z.string(),
  quote: buildQuoteSchema,
  quantity: z.number().int().positive(),
  lineTotal: rupiahSchema,
  problem: z.enum(cartBuildProblems).nullable(),
});
export type CartBuild = z.infer<typeof cartBuildSchema>;

export const cartSchema = z.object({
  items: z.array(cartLineSchema),
  builds: z.array(cartBuildSchema),
  subtotal: rupiahSchema,
  /** parts plus bikes */
  itemCount: z.number().int().nonnegative(),
  /** false while any line or build cannot be bought as it stands */
  canCheckout: z.boolean(),
});
export type Cart = z.infer<typeof cartSchema>;
