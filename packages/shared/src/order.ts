import { z } from 'zod';
import { MAX_LINE_QUANTITY } from './build.js';
import { cartLineInputSchema, MAX_CART_LINES } from './cart.js';
import { partModuleSchema, rupiahSchema } from './catalog.js';

/** How long a placed order holds its stock while waiting for payment. */
export const PAYMENT_WINDOW_MINUTES = 60;
/**
 * The shared demo accounts hold stock for less: every visitor signs in to them, so one visitor's unpaid order
 * should not keep parts off sale for an hour.
 */
export const DEMO_PAYMENT_WINDOW_MINUTES = 10;

export const paymentWindowMinutes = (isDemo: boolean) =>
  isDemo ? DEMO_PAYMENT_WINDOW_MINUTES : PAYMENT_WINDOW_MINUTES;

export const orderStatuses = [
  'PENDING_PAYMENT',
  'PAID',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
  'EXPIRED',
] as const;
export const orderStatusSchema = z.enum(orderStatuses);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

export const checkoutInputSchema = z.object({
  addressId: z.uuid(),
  /** generated once per checkout attempt by the client; a retry with the same key returns the same order */
  idempotencyKey: z.uuid(),
  /**
   * "Buy now": order these parts instead of the cart, which is left as it is. Without it the whole cart is ordered
   * and emptied.
   */
  items: z
    .array(cartLineInputSchema.extend({ quantity: z.number().int().min(1).max(MAX_LINE_QUANTITY) }))
    .min(1)
    .max(MAX_CART_LINES)
    .optional(),
});
export type CheckoutInput = z.infer<typeof checkoutInputSchema>;

export const orderNumberSchema = z.string().regex(/^RKT-\d{6}-[A-Z2-9]{6}$/, 'Unknown order');

export const orderSummarySchema = z.object({
  number: z.string(),
  status: orderStatusSchema,
  total: rupiahSchema,
  itemCount: z.number().int().positive(),
  createdAt: z.string(),
});
export type OrderSummary = z.infer<typeof orderSummarySchema>;

export const orderDetailSchema = z.object({
  number: z.string(),
  status: orderStatusSchema,
  subtotal: rupiahSchema,
  shippingFee: rupiahSchema,
  total: rupiahSchema,
  shipping: z.object({
    recipient: z.string(),
    phone: z.string(),
    line1: z.string(),
    line2: z.string(),
    city: z.string(),
    province: z.string(),
    postalCode: z.string(),
    zone: z.string(),
  }),
  /** every part bought, single parts and the parts of each build alike */
  items: z.array(
    z.object({
      slug: z.string(),
      name: z.string(),
      model: z.string(),
      category: z.string().nullable(),
      /** the 3D module that draws the part; null once the part is gone from the catalogue */
      module: partModuleSchema.nullable(),
      /** the finish's key, '' for a part without finishes; it picks the matching picture */
      colorKey: z.string(),
      colorLabel: z.string().nullable(),
      unitPrice: rupiahSchema,
      quantity: z.number().int().positive(),
      lineTotal: rupiahSchema,
      /** the build this part went into; null for a part bought on its own */
      buildId: z.string().nullable(),
    }),
  ),
  /** the bikes in the order; their parts are the items carrying their id */
  builds: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      colorKey: z.string(),
      colorLabel: z.string().nullable(),
      quantity: z.number().int().positive(),
      unitPrice: rupiahSchema,
      lineTotal: rupiahSchema,
    }),
  ),
  events: z.array(z.object({ status: orderStatusSchema, note: z.string(), at: z.string() })),
  createdAt: z.string(),
  paymentExpiresAt: z.string(),
  paidAt: z.string().nullable(),
  payment: z
    .object({
      redirectUrl: z.string().nullable(),
      status: z.string().nullable(),
      method: z.string().nullable(),
    })
    .nullable(),
  canPay: z.boolean(),
  canCancel: z.boolean(),
  fulfilment: z.object({
    courier: z.string().nullable(),
    trackingNumber: z.string().nullable(),
    shippedAt: z.string().nullable(),
    deliveredAt: z.string().nullable(),
  }),
  refundStatus: z.enum(['NONE', 'NEEDED', 'DONE']),
});
export type OrderDetail = z.infer<typeof orderDetailSchema>;

const paymentMethods: Record<string, string> = {
  qris: 'QRIS',
  gopay: 'GoPay',
  shopeepay: 'ShopeePay',
  bank_transfer: 'Bank transfer (virtual account)',
  echannel: 'Mandiri Bill',
  permata: 'Permata virtual account',
  credit_card: 'Card',
  cstore: 'Convenience store',
  akulaku: 'Akulaku',
  kredivo: 'Kredivo',
};

/** Midtrans payment_type as people say it: "qris" → "QRIS", "bank_transfer" → "Bank transfer (virtual account)". */
export function paymentMethodLabel(type: string): string {
  // own keys only: "constructor" or "toString" would otherwise name a built-in function
  return Object.hasOwn(paymentMethods, type) ? paymentMethods[type] : type.replaceAll('_', ' ');
}
