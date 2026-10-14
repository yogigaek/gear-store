import { z } from 'zod';
import { colorSchema, productSlugSchema, productSummarySchema, rupiahSchema } from './catalog.js';

// The E-1 build: one part in each slot. The browser sends only which parts and which frame colour; the server
// decides whether they fit together and what the build costs.

/** Most of one part or one build a single order can hold; stops a typo from becoming a 1000-unit order. */
export const MAX_LINE_QUANTITY = 10;

/** A build as chosen: part slug per slot (keyed by the slot's category slug), and the frame's colour. */
export const buildSelectionSchema = z.object({
  parts: z.record(productSlugSchema, productSlugSchema).refine((p) => Object.keys(p).length <= 12, {
    message: 'Too many slots',
  }),
  colorKey: z.string().max(40),
});
export type BuildSelection = z.infer<typeof buildSelectionSchema>;

/** POST /build/quote: a build and how many of it, so stock is checked for the number of bikes wanted. */
export const buildQuoteInputSchema = buildSelectionSchema.extend({
  quantity: z.number().int().min(1).max(MAX_LINE_QUANTITY).default(1),
});
export type BuildQuoteInput = z.input<typeof buildQuoteInputSchema>;

export const buildOptionSchema = productSummarySchema.extend({
  /** the part's finishes; a build takes its colour from the frame's */
  colors: z.array(colorSchema),
});
export type BuildOption = z.infer<typeof buildOptionSchema>;

export const buildSlotSchema = z.object({
  category: productSlugSchema,
  name: z.string(),
  description: z.string(),
  options: z.array(buildOptionSchema),
  /** the part the configurator starts with: the cheapest one in stock */
  defaultSlug: productSlugSchema.nullable(),
});
export type BuildSlot = z.infer<typeof buildSlotSchema>;

/** Two parts that cannot go on the same bike, and why. */
export const conflictSchema = z.object({ a: productSlugSchema, b: productSlugSchema, reason: z.string() });
export type Conflict = z.infer<typeof conflictSchema>;

/** GET /build: everything the configurator needs to offer only what can be built. */
export const buildCatalogSchema = z.object({
  name: z.string(),
  slots: z.array(buildSlotSchema),
  conflicts: z.array(conflictSchema),
  /** the price of the starting build (every slot's starting part), or null when that build cannot be made */
  fromPrice: rupiahSchema.nullable(),
});
export type BuildCatalog = z.infer<typeof buildCatalogSchema>;

export const buildProblemKinds = [
  'MISSING_PART',
  'UNKNOWN_PART',
  'WRONG_SLOT',
  'CONFLICT',
  'UNKNOWN_COLOR',
  'OUT_OF_STOCK',
] as const;
export const buildProblemSchema = z.object({
  kind: z.enum(buildProblemKinds),
  message: z.string(),
  /** the slots the problem is about, to mark them in the configurator */
  slots: z.array(z.string()),
});
export type BuildProblem = z.infer<typeof buildProblemSchema>;

/** A build priced and checked by the server. It can be added to a cart only when `problems` is empty. */
export const buildQuoteSchema = z.object({
  label: z.string(),
  colorKey: z.string(),
  colorLabel: z.string().nullable(),
  parts: z.array(z.object({ slot: z.string(), slotName: z.string(), product: productSummarySchema })),
  /** one bike: the sum of its parts at today's prices */
  unitPrice: rupiahSchema,
  problems: z.array(buildProblemSchema),
});
export type BuildQuote = z.infer<typeof buildQuoteSchema>;
