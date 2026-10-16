import { z } from 'zod';

const slug = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'lowercase letters, digits and single hyphens');

/** Prices are whole Rupiah. Integers end to end: no floating-point money anywhere. */
export const rupiahSchema = z.number().int().nonnegative();

export const specSchema = z.object({ label: z.string(), value: z.string() });
export type Spec = z.infer<typeof specSchema>;

export const colorSchema = z.object({
  key: z.string(),
  label: z.string(),
  hex: z.string().regex(/^#[0-9a-f]{6}$/i),
});
export type Color = z.infer<typeof colorSchema>;

/**
 * The 3D module that draws a part: the configurator and the product page show the part as it sits on the
 * E-1. Accessories have no place on the bike.
 */
export const partModules = [
  'FRAME',
  'BATTERY',
  'SHOCK',
  'FORK',
  'WHEELSET',
  'DRIVETRAIN',
  'COCKPIT',
  'SEAT',
  'ACCESSORY',
] as const;
export const partModuleSchema = z.enum(partModules);
export type PartModule = z.infer<typeof partModuleSchema>;

/** A part type. `slot` is its place in the E-1 build (0 first), or null for accessories outside the build. */
export const categorySchema = z.object({
  slug,
  name: z.string(),
  description: z.string(),
  slot: z.number().int().nonnegative().nullable(),
  productCount: z.number().int().nonnegative(),
});
export type Category = z.infer<typeof categorySchema>;

export const productSummarySchema = z.object({
  slug,
  name: z.string(),
  model: z.string(),
  category: slug,
  module: partModuleSchema,
  price: rupiahSchema,
  stock: z.number().int().nonnegative(),
  /** the three specs printed on the card's spec plate */
  plate: z.array(specSchema).max(3),
});
export type ProductSummary = z.infer<typeof productSummarySchema>;

export const productDetailSchema = productSummarySchema.extend({
  description: z.string(),
  specs: z.array(specSchema),
  colors: z.array(colorSchema),
});
export type ProductDetail = z.infer<typeof productDetailSchema>;

/** `type` lists parts in build order (frame first, accessories last), cheapest first within a type */
export const productSorts = ['type', 'price-asc', 'price-desc', 'name'] as const;
export type ProductSort = (typeof productSorts)[number];

/** GET /products query string. Everything optional; numbers arrive as strings and are coerced. */
export const productQuerySchema = z
  .object({
    category: slug.optional(),
    q: z.string().trim().min(1).max(80).optional(),
    minPrice: z.coerce.number().pipe(rupiahSchema).optional(),
    maxPrice: z.coerce.number().pipe(rupiahSchema).optional(),
    inStock: z.stringbool().optional(),
    sort: z.enum(productSorts).default('type'),
    page: z.coerce.number().int().min(1).max(1000).default(1),
    pageSize: z.coerce.number().int().min(1).max(48).default(12),
  })
  .refine((q) => q.minPrice === undefined || q.maxPrice === undefined || q.minPrice <= q.maxPrice, {
    message: 'minPrice must not exceed maxPrice',
    path: ['minPrice'],
  });
export type ProductQuery = z.infer<typeof productQuerySchema>;

export const productPageSchema = z.object({
  items: z.array(productSummarySchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});
export type ProductPage = z.infer<typeof productPageSchema>;

export const errorSchema = z.object({
  statusCode: z.number().int(),
  message: z.string(),
  issues: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});
export type ApiError = z.infer<typeof errorSchema>;

/** Saved products, newest first. Capped so one account cannot grow the table without bound. */
export const WISHLIST_LIMIT = 100;
export const wishlistSchema = z.array(productSummarySchema);
export type Wishlist = z.infer<typeof wishlistSchema>;
export const productSlugSchema = slug;
