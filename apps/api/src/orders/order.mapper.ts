import type { OrderDetail } from '@gear-store/shared';
import { OrderStatus, type Prisma } from '../generated/prisma/client.js';

export const detailInclude = {
  items: {
    orderBy: { id: 'asc' },
    include: { product: { select: { module: true, category: { select: { slug: true } } } } },
  },
  builds: { orderBy: { id: 'asc' } },
  events: { orderBy: { createdAt: 'asc' } },
  payment: true,
} satisfies Prisma.OrderInclude;

export type OrderRow = Prisma.OrderGetPayload<{ include: typeof detailInclude }>;

/** what an order list counts: each single part, and each bike as one, not its parts */
export const countItems = (o: { items: { quantity: number }[]; builds: { quantity: number }[] }) =>
  [...o.items, ...o.builds].reduce((sum, i) => sum + i.quantity, 0);

export function toDetail(o: OrderRow): OrderDetail {
  const waiting = o.status === OrderStatus.PENDING_PAYMENT && o.paymentExpiresAt > new Date();
  return {
    number: o.number,
    status: o.status,
    subtotal: o.subtotal,
    shippingFee: o.shippingFee,
    total: o.total,
    shipping: {
      recipient: o.shipRecipient,
      phone: o.shipPhone,
      line1: o.shipLine1,
      line2: o.shipLine2,
      city: o.shipCity,
      province: o.shipProvince,
      postalCode: o.shipPostalCode,
      zone: o.shippingZone,
    },
    items: o.items.map((i) => ({
      slug: i.slug,
      name: i.name,
      model: i.model,
      category: i.product?.category.slug ?? null,
      module: i.product?.module ?? null,
      colorKey: i.colorKey,
      colorLabel: i.colorLabel,
      unitPrice: i.unitPrice,
      quantity: i.quantity,
      lineTotal: i.lineTotal,
      buildId: i.buildId,
    })),
    builds: o.builds.map((b) => ({
      id: b.id,
      label: b.label,
      colorKey: b.colorKey,
      colorLabel: b.colorLabel,
      quantity: b.quantity,
      unitPrice: b.unitPrice,
      lineTotal: b.lineTotal,
    })),
    events: o.events.map((e) => ({ status: e.status, note: e.note, at: e.createdAt.toISOString() })),
    createdAt: o.createdAt.toISOString(),
    paymentExpiresAt: o.paymentExpiresAt.toISOString(),
    paidAt: o.paidAt?.toISOString() ?? null,
    payment: o.payment
      ? {
          redirectUrl: o.payment.redirectUrl,
          status: o.payment.transactionStatus,
          method: o.payment.paymentType,
        }
      : null,
    canPay: waiting,
    canCancel: waiting,
    fulfilment: {
      courier: o.courier,
      trackingNumber: o.trackingNumber,
      shippedAt: o.shippedAt?.toISOString() ?? null,
      deliveredAt: o.deliveredAt?.toISOString() ?? null,
    },
    refundStatus: o.refundStatus,
  };
}
