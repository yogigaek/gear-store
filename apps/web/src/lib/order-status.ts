import type { OrderStatus } from '@gear-store/shared';

export const statusLabels: Record<OrderStatus, string> = {
  PENDING_PAYMENT: 'Waiting for payment',
  PAID: 'Paid',
  SHIPPED: 'Shipped',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
};
