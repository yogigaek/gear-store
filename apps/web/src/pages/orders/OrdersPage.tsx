import { orderNumberSchema } from '@gear-store/shared';
import { Link, Navigate, useSearchParams } from 'react-router';
import { OrderStatusBadge } from '../../components/checkout/OrderStatusBadge';
import { Notice } from '../../components/ui/Field';
import { Label } from '../../components/ui/Label';
import { Price } from '../../components/ui/Price';
import { formatDateTime } from '../../lib/date';
import { useOrders } from '../../lib/orders';

export function OrdersPage() {
  // back from Midtrans through the dashboard's redirect URL, which adds ?order_id=…: open that order
  const [params] = useSearchParams();
  const fromPayment = orderNumberSchema.safeParse(params.get('order_id'));
  const orders = useOrders({ enabled: !fromPayment.success });
  if (fromPayment.success) {
    return <Navigate to={`/orders/${fromPayment.data}?${params}`} replace />;
  }
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="mb-8 space-y-1 border-b border-ink pb-4">
        <Label>Account</Label>
        <h1 className="font-expanded text-4xl font-extrabold uppercase">Orders</h1>
      </div>
      {orders.isPending && <p className="font-mono text-sm text-ink-3">Loading orders…</p>}
      {orders.isError && <Notice tone="error">{orders.error.message}</Notice>}
      {orders.data?.length === 0 && (
        <div className="space-y-3">
          <p className="text-ink-2">No orders yet.</p>
          <Link to="/products" className="font-semibold underline underline-offset-4">
            Browse the catalogue
          </Link>
        </div>
      )}
      {orders.data && orders.data.length > 0 && (
        <ul className="border-t border-ink">
          {orders.data.map((o) => (
            <li key={o.number}>
              <Link
                to={`/orders/${o.number}`}
                className="grid gap-x-6 gap-y-1 border-b border-bench px-1 py-4 hover:bg-alu-50 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"
              >
                <span className="space-y-0.5">
                  <span className="block font-mono font-semibold">{o.number}</span>
                  <span className="block text-sm text-ink-3">
                    {formatDateTime(o.createdAt)} · {o.itemCount} {o.itemCount === 1 ? 'item' : 'items'}
                  </span>
                </span>
                <OrderStatusBadge status={o.status} />
                <Price amount={o.total} className="sm:text-right" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
