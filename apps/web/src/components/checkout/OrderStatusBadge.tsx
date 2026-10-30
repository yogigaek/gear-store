import type { OrderStatus } from '@gear-store/shared';

import { statusLabels } from '../../lib/order-status';

const look: Record<OrderStatus, { label: string; className: string }> = {
  PENDING_PAYMENT: { label: statusLabels.PENDING_PAYMENT, className: 'border-signal bg-signal text-stage' },
  PAID: { label: statusLabels.PAID, className: 'border-ok text-ok' },
  SHIPPED: { label: statusLabels.SHIPPED, className: 'border-ok text-ok' },
  DELIVERED: { label: statusLabels.DELIVERED, className: 'border-ok bg-ok text-alu-50' },
  CANCELLED: { label: statusLabels.CANCELLED, className: 'border-bench-strong text-ink-3' },
  EXPIRED: { label: statusLabels.EXPIRED, className: 'border-bench-strong text-ink-3' },
};

/** Status as a stamped tag. Waiting is the only state that asks something of the buyer, so only it gets signal yellow. */
export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const { label, className } = look[status];
  return (
    <span
      className={`inline-block w-fit justify-self-start border px-2 py-0.5 font-mono text-xs uppercase tracking-[0.06em] ${className}`}
    >
      {label}
    </span>
  );
}
