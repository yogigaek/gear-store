import { z } from 'zod';
import { colorSchema, partModuleSchema, rupiahSchema, specSchema } from './catalog.js';
import { orderDetailSchema, orderStatuses, orderStatusSchema } from './order.js';
import { roles } from './auth.js';

const slug = z
  .string()
  .trim()
  .min(1, 'Enter a slug')
  .max(80, 'Use at most 80 characters')
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, digits and single hyphens');

export const pageOf = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item),
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
  });

export const adminListQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type AdminListQuery = z.infer<typeof adminListQuerySchema>;

// ── Overview ────────────────────────────────────────────────────────────────

export const statsRanges = [7, 30, 90] as const;
export const adminStatsQuerySchema = z.object({
  days: z.coerce
    .number()
    .refine(
      (d): d is (typeof statsRanges)[number] => (statsRanges as readonly number[]).includes(d),
      'Use 7, 30 or 90',
    )
    .default(30),
});

export const adminStatsSchema = z.object({
  days: z.number().int(),
  /** paid, shipped and delivered orders, by the day they were paid (Jakarta time) */
  revenue: rupiahSchema,
  paidOrders: z.number().int(),
  averageOrderValue: rupiahSchema,
  daily: z.array(z.object({ date: z.string(), revenue: rupiahSchema, orders: z.number().int() })),
  topProducts: z.array(
    z.object({ slug: z.string(), name: z.string(), quantity: z.number().int(), revenue: rupiahSchema }),
  ),
  /** current numbers, not limited to the range */
  awaitingShipment: z.number().int(),
  awaitingPayment: z.number().int(),
  refundsNeeded: z.number().int(),
  lowStock: z.array(
    z.object({ slug: z.string(), name: z.string(), model: z.string(), stock: z.number().int() }),
  ),
});
export type AdminStats = z.infer<typeof adminStatsSchema>;

/** At or below this many units a product shows up under "Low stock". */
export const LOW_STOCK_THRESHOLD = 5;

// ── Products and categories ────────────────────────────────────────────────

export const adminProductInputSchema = z.object({
  slug,
  name: z.string().trim().min(2, 'Enter a name').max(80, 'Use at most 80 characters'),
  model: z.string().trim().min(1, 'Enter the part code').max(20, 'Use at most 20 characters'),
  category: z.string().min(1, 'Choose a part type').pipe(slug),
  module: partModuleSchema,
  description: z
    .string()
    .trim()
    .min(10, 'Write at least 10 characters')
    .max(2000, 'Use at most 2000 characters'),
  price: z.number().int().min(1000, 'At least Rp 1.000').max(1_000_000_000),
  stock: z.number().int().min(0).max(100_000, 'At most 100.000 units'),
  isActive: z.boolean(),
  /** the first three are printed on the spec plate */
  specs: z
    .array(
      z.object({
        label: z.string().trim().min(1, 'Name the spec').max(40, 'Use at most 40 characters'),
        value: z.string().trim().min(1, 'Enter a value').max(80, 'Use at most 80 characters'),
      }),
    )
    .min(3, 'Add at least three specs: they fill the spec plate')
    .max(20),
  colors: z
    .array(
      z.object({
        key: slug,
        label: z.string().trim().min(1, 'Name the finish').max(30, 'Use at most 30 characters'),
        hex: z.string().regex(/^#[0-9a-f]{6}$/i, 'Use a colour like #24292c'),
      }),
    )
    .max(8)
    .refine((c) => new Set(c.map((x) => x.key)).size === c.length, 'Each finish needs its own key'),
});
export type AdminProductInput = z.infer<typeof adminProductInputSchema>;

/** Editing sends back the updatedAt it was opened with; if the product changed since (an order took stock), the save is refused. */
export const adminProductUpdateSchema = adminProductInputSchema.extend({
  expectedUpdatedAt: z.iso.datetime(),
});
export type AdminProductUpdate = z.infer<typeof adminProductUpdateSchema>;

export const adminProductSchema = z.object({
  slug: z.string(),
  name: z.string(),
  model: z.string(),
  category: z.string(),
  module: partModuleSchema,
  description: z.string(),
  price: rupiahSchema,
  stock: z.number().int(),
  isActive: z.boolean(),
  specs: z.array(specSchema),
  colors: z.array(colorSchema),
  updatedAt: z.string(),
});
export type AdminProduct = z.infer<typeof adminProductSchema>;

export const adminProductRowSchema = adminProductSchema.omit({
  description: true,
  specs: true,
  colors: true,
});
export type AdminProductRow = z.infer<typeof adminProductRowSchema>;

export const adminCategoryInputSchema = z.object({
  slug,
  name: z.string().trim().min(2, 'Enter a name').max(40, 'Use at most 40 characters'),
  description: z.string().trim().min(2, 'Describe the category').max(120, 'Use at most 120 characters'),
  sortOrder: z.number().int().min(0).max(1000),
  /** its place in the E-1 build, or null for accessories */
  slot: z.number().int().min(0).max(20).nullable(),
});
export type AdminCategoryInput = z.infer<typeof adminCategoryInputSchema>;

export const adminCategorySchema = adminCategoryInputSchema.extend({
  productCount: z.number().int(),
  activeCount: z.number().int(),
});
export type AdminCategory = z.infer<typeof adminCategorySchema>;

// ── Orders ──────────────────────────────────────────────────────────────────

export const adminOrderQuerySchema = adminListQuerySchema.extend({
  status: orderStatusSchema.optional(),
  refund: z.literal('needed').optional(),
});
export type AdminOrderQuery = z.infer<typeof adminOrderQuerySchema>;

export const adminOrderRowSchema = z.object({
  number: z.string(),
  status: orderStatusSchema,
  total: rupiahSchema,
  itemCount: z.number().int(),
  customer: z.object({ name: z.string(), email: z.string() }),
  createdAt: z.string(),
  refundStatus: z.enum(['NONE', 'NEEDED', 'DONE']),
});
export type AdminOrderRow = z.infer<typeof adminOrderRowSchema>;

export const adminOrderSchema = orderDetailSchema.extend({
  customer: z.object({ name: z.string(), email: z.string() }),
});
export type AdminOrder = z.infer<typeof adminOrderSchema>;

export const couriers = ['JNE', 'J&T Express', 'SiCepat', 'AnterAja', 'Pos Indonesia', 'GoSend'] as const;
export const shipInputSchema = z.object({
  courier: z.enum(couriers, { error: 'Choose a courier' }),
  trackingNumber: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{6,40}$/, 'Tracking numbers have 6 to 40 letters, digits or hyphens'),
});
export type ShipInput = z.infer<typeof shipInputSchema>;

export { orderStatuses };

// ── Customers ───────────────────────────────────────────────────────────────

export const adminUserRowSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  name: z.string(),
  role: z.enum(roles),
  emailVerified: z.boolean(),
  isDemo: z.boolean(),
  orderCount: z.number().int(),
  createdAt: z.string(),
});
export type AdminUserRow = z.infer<typeof adminUserRowSchema>;

export const roleInputSchema = z.object({ role: z.enum(roles) });
