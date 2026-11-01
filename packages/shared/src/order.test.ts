import { describe, expect, it } from 'vitest';
import {
  checkoutInputSchema,
  DEMO_PAYMENT_WINDOW_MINUTES,
  orderDetailSchema,
  orderNumberSchema,
  orderStatuses,
  orderStatusSchema,
  orderSummarySchema,
  PAYMENT_WINDOW_MINUTES,
  paymentMethodLabel,
  paymentWindowMinutes,
} from './order.js';

const checkout = { addressId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() };
const part = (quantity: number, slug = 'fender-set') => ({ slug, colorKey: '', quantity });

describe('payment window', () => {
  it('holds stock an hour for an account and ten minutes for a shared demo account', () => {
    expect(paymentWindowMinutes(false)).toBe(PAYMENT_WINDOW_MINUTES);
    expect(paymentWindowMinutes(true)).toBe(DEMO_PAYMENT_WINDOW_MINUTES);
    expect([PAYMENT_WINDOW_MINUTES, DEMO_PAYMENT_WINDOW_MINUTES]).toEqual([60, 10]);
  });
});

describe('checkout input', () => {
  it('orders the whole cart without items', () => {
    expect(checkoutInputSchema.parse(checkout)).toEqual(checkout);
  });

  it('needs a UUID address and a UUID idempotency key', () => {
    for (const bad of ['', 'key-1', '00000000-0000-0000-0000-00000000000g', 42])
      expect(checkoutInputSchema.safeParse({ ...checkout, idempotencyKey: bad }).success).toBe(false);
    expect(checkoutInputSchema.safeParse({ ...checkout, addressId: 'home' }).success).toBe(false);
    expect(checkoutInputSchema.safeParse({ addressId: checkout.addressId }).success).toBe(false);
  });

  it('buys now 1 to 50 lines of 1 to 10 each', () => {
    const lines = (n: number) => Array.from({ length: n }, (_, i) => part(1, `part-${i}`));
    expect(checkoutInputSchema.safeParse({ ...checkout, items: lines(1) }).success).toBe(true);
    expect(checkoutInputSchema.safeParse({ ...checkout, items: lines(50) }).success).toBe(true);
    expect(checkoutInputSchema.safeParse({ ...checkout, items: [] }).success).toBe(false);
    expect(checkoutInputSchema.safeParse({ ...checkout, items: lines(51) }).success).toBe(false);
    expect(checkoutInputSchema.safeParse({ ...checkout, items: [part(10)] }).success).toBe(true);
    // a cart line may say 0 to remove it; a line bought on its own cannot
    for (const q of [0, 11, 2.5])
      expect(checkoutInputSchema.safeParse({ ...checkout, items: [part(q)] }).success).toBe(false);
  });
});

describe('order numbers', () => {
  it('reads RKT-yymmdd-six characters without 0 or 1', () => {
    expect(orderNumberSchema.safeParse('RKT-261031-ABCD29').success).toBe(true);
    expect(orderNumberSchema.safeParse('RKT-261031-OIZZZZ').success).toBe(true);
  });

  it.each([
    'rkt-261031-ABCD29',
    'RKT-261031-abcd29',
    'RKT-261031-ABCD20',
    'RKT-261031-ABCD21',
    'RKT-26103-ABCD29',
    'RKT-261031-ABCD2',
    'RKT-261031-ABCD299',
    ' RKT-261031-ABCD29',
    'RKT-261031-ABCD29\n',
    'RKT-261031-ABCD29/../admin',
    '',
  ])('refuses %j', (number) => {
    const result = orderNumberSchema.safeParse(number);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('Unknown order');
  });
});

describe('order replies', () => {
  it('knows the six statuses only', () => {
    expect(orderStatuses).toHaveLength(6);
    expect(orderStatusSchema.safeParse('REFUNDED').success).toBe(false);
    expect(orderStatusSchema.safeParse('paid').success).toBe(false);
  });

  it('counts at least one item in a summary', () => {
    const summary = { number: 'RKT-261031-ABCD29', status: 'PAID', total: 0, itemCount: 1, createdAt: 'x' };
    expect(orderSummarySchema.safeParse(summary).success).toBe(true);
    expect(orderSummarySchema.safeParse({ ...summary, itemCount: 0 }).success).toBe(false);
    expect(orderSummarySchema.safeParse({ ...summary, total: -1 }).success).toBe(false);
  });

  it('reads an order with no payment yet, a part gone from the catalogue, and a refund state', () => {
    const order = {
      number: 'RKT-261031-ABCD29',
      status: 'PENDING_PAYMENT',
      subtotal: 150000,
      shippingFee: 15000,
      total: 165000,
      shipping: {
        recipient: 'Ana',
        phone: '+6281234567890',
        line1: 'Jl. Sudirman 1',
        line2: '',
        city: 'Jakarta',
        province: 'DKI Jakarta',
        postalCode: '10110',
        zone: 'A',
      },
      items: [
        {
          slug: 'fender-set',
          name: 'Fender set',
          model: 'FS-1',
          category: null,
          module: null,
          colorKey: '',
          colorLabel: null,
          unitPrice: 150000,
          quantity: 1,
          lineTotal: 150000,
          buildId: null,
        },
      ],
      builds: [],
      events: [{ status: 'PENDING_PAYMENT', note: 'Order placed', at: 'x' }],
      createdAt: 'x',
      paymentExpiresAt: 'x',
      paidAt: null,
      payment: null,
      canPay: true,
      canCancel: true,
      fulfilment: { courier: null, trackingNumber: null, shippedAt: null, deliveredAt: null },
      refundStatus: 'NONE',
    };
    expect(orderDetailSchema.safeParse(order).success).toBe(true);
    expect(orderDetailSchema.safeParse({ ...order, refundStatus: 'MAYBE' }).success).toBe(false);
    expect(orderDetailSchema.safeParse({ ...order, payment: undefined }).success).toBe(false);
  });
});

describe('paymentMethodLabel', () => {
  it.each([
    ['qris', 'QRIS'],
    ['bank_transfer', 'Bank transfer (virtual account)'],
    ['credit_card', 'Card'],
    ['new_wallet_type', 'new wallet type'],
    ['', ''],
  ])('says %j as %j', (type, label) => {
    expect(paymentMethodLabel(type)).toBe(label);
  });

  it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty'])(
    'reads the property name %j as a payment type, not as a built-in',
    (type) => {
      expect(paymentMethodLabel(type)).toBe(type.replaceAll('_', ' '));
    },
  );
});
