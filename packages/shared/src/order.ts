import { z } from 'zod';
import { rupiahSchema } from './catalog.js';

/** How long a placed order holds its stock while waiting for payment. */
export const PAYMENT_WINDOW_MINUTES = 60;

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
  items: z.array(
    z.object({
      slug: z.string(),
      name: z.string(),
      model: z.string(),
      category: z.string().nullable(),
      colorLabel: z.string().nullable(),
      unitPrice: rupiahSchema,
      quantity: z.number().int().positive(),
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
  return paymentMethods[type] ?? type.replaceAll('_', ' ');
}
