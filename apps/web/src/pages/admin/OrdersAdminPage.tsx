import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { OrderStatusBadge } from '../../components/checkout/OrderStatusBadge';
import { Notice } from '../../components/ui/Field';
import { Price } from '../../components/ui/Price';
import { useAdminOrders } from '../../lib/admin';
import { formatDateTime } from '../../lib/date';
import { AdminHeading } from './AdminLayout';
import { Pager, searchClass } from './Pager';

const filters = [
  { label: 'All', status: undefined, refund: undefined },
  { label: 'To ship', status: 'PAID', refund: undefined },
  { label: 'Shipped', status: 'SHIPPED', refund: undefined },
  { label: 'Waiting for payment', status: 'PENDING_PAYMENT', refund: undefined },
  { label: 'Refunds', status: undefined, refund: 'needed' },
] as const;

export function OrdersAdminPage() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? undefined;
  const refund = params.get('refund') ?? undefined;
  const page = Number(params.get('page') ?? 1) || 1;
  const [q, setQ] = useState(params.get('q') ?? '');
  const orders = useAdminOrders({ status, refund, q: params.get('q') ?? undefined, page });

  const go = (next: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ status, refund, q: params.get('q') ?? undefined, ...next }))
      if (v) p.set(k, v);
    setParams(p);
  };

  return (
    <>
      <AdminHeading title="Orders" />
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter orders">
        {filters.map((f) => {
          const on = f.status === status && f.refund === refund;
          return (
            <button
              key={f.label}
              type="button"
              aria-pressed={on}
              onClick={() => go({ status: f.status, refund: f.refund, page: undefined })}
              className={`min-h-11 border px-3 text-sm ${on ? 'border-ink bg-ink text-alu-50' : 'border-bench-strong hover:border-ink'}`}
            >
              {f.label}
            </button>
          );
        })}
      </div>
      <form
        className="mb-4"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          go({ q: q.trim() || undefined, page: undefined });
        }}
      >
        <label htmlFor="order-search" className="sr-only">
          Search by order number, customer email or recipient
        </label>
        <input
          id="order-search"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Order number, email or recipient"
          className={searchClass}
        />
      </form>
      {orders.isError && <Notice tone="error">{orders.error.message}</Notice>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-sm">
          <thead>
            <tr className="border-b border-ink text-left font-mono text-xs uppercase tracking-[0.06em] text-ink-3">
              <th className="py-2 font-normal">Order</th>
              <th className="py-2 font-normal">Customer</th>
              <th className="py-2 font-normal">Status</th>
              <th className="py-2 text-right font-normal">Total</th>
            </tr>
          </thead>
          <tbody className={orders.isPlaceholderData ? 'opacity-60' : ''}>
            {orders.data?.items.map((o) => (
              <tr key={o.number} className="border-b border-bench hover:bg-alu-50">
                <td className="py-3">
                  <Link
                    to={`/admin/orders/${o.number}`}
                    className="font-mono font-semibold underline-offset-4 hover:underline"
                  >
                    {o.number}
                  </Link>
                  <span className="block text-xs text-ink-3">{formatDateTime(o.createdAt)}</span>
                </td>
                <td className="py-3">
                  {o.customer.name}
                  <span className="block font-mono text-xs text-ink-3">{o.customer.email}</span>
                </td>
                <td className="py-3">
                  <span className="flex flex-wrap gap-1">
                    <OrderStatusBadge status={o.status} />
                    {o.refundStatus === 'NEEDED' && (
                      <span className="border border-danger px-2 py-0.5 font-mono text-xs uppercase text-danger">
                        Refund
                      </span>
                    )}
                  </span>
                </td>
                <td className="py-3 text-right">
                  <Price amount={o.total} className="font-normal" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {orders.data?.items.length === 0 && <p className="mt-4 text-ink-2">No orders match.</p>}
      {orders.data && <Pager {...orders.data} onPage={(p) => go({ page: String(p) })} />}
    </>
  );
}
