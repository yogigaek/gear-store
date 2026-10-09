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

export const categorySchema = z.object({
  slug,
  name: z.string(),
  description: z.string(),
  productCount: z.number().int().nonnegative(),
});
export type Category = z.infer<typeof categorySchema>;

export const productSummarySchema = z.object({
  slug,
  name: z.string(),
  model: z.string(),
  brand: z.string(),
  category: slug,
  price: rupiahSchema,
  stock: z.number().int().nonnegative(),
  /** the three specs printed on the card's spec plate */
  plate: z.array(specSchema).max(3),
  has3d: z.boolean(),
});
export type ProductSummary = z.infer<typeof productSummarySchema>;

export const productDetailSchema = productSummarySchema.extend({
  description: z.string(),
  specs: z.array(specSchema),
  colors: z.array(colorSchema),
});
export type ProductDetail = z.infer<typeof productDetailSchema>;

export const productSorts = ['newest', 'price-asc', 'price-desc', 'name'] as const;
export type ProductSort = (typeof productSorts)[number];

/** GET /products query string. Everything optional; numbers arrive as strings and are coerced. */
export const productQuerySchema = z
  .object({
    category: slug.optional(),
    q: z.string().trim().min(1).max(80).optional(),
    brand: z.string().trim().min(1).max(40).optional(),
    minPrice: z.coerce.number().pipe(rupiahSchema).optional(),
    maxPrice: z.coerce.number().pipe(rupiahSchema).optional(),
    inStock: z.stringbool().optional(),
    sort: z.enum(productSorts).default('newest'),
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

export const brandSchema = z.object({ name: z.string(), productCount: z.number().int().nonnegative() });
export type Brand = z.infer<typeof brandSchema>;

/** Saved products, newest first. Capped so one account cannot grow the table without bound. */
export const WISHLIST_LIMIT = 100;
export const wishlistSchema = z.array(productSummarySchema);
export type Wishlist = z.infer<typeof wishlistSchema>;
export const productSlugSchema = slug;
