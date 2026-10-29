import { orderNumberSchema } from '@gear-store/shared';
import { useEffect, useRef } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router';
import { OrderStatusBadge } from '../../components/checkout/OrderStatusBadge';
import { AccountCrumb } from '../../components/layout/AccountCrumb';
import { RequireAuth } from '../../components/layout/RequireAuth';
import { Button } from '../../components/ui/Button';
import { Notice } from '../../components/ui/Field';
import { PageTitle } from '../../components/ui/PageTitle';
import { Price } from '../../components/ui/Price';
import { SlowServerNote } from '../../components/ui/SlowServerNote';
import { formatDateTime } from '../../lib/date';
import { ORDERS_PAGE, shownOrders } from '../../lib/order-list';
import { useOrders } from '../../lib/orders';
import { closeAllCheckoutKeys } from '../../lib/checkout-key';

export function OrdersPage() {
  // back from Midtrans through the dashboard's redirect URL, which adds ?order_id=…: the return page opens the
  // order when this browser is signed in, and otherwise says where to go (no sign-in wall after paying in the app)
  const [params] = useSearchParams();
  if (orderNumberSchema.safeParse(params.get('order_id')).success) {
    return <Navigate to={`/payment-done?${params}`} replace />;
  }
  return (
    <RequireAuth>
      <OrderList />
    </RequireAuth>
  );
}

function OrderList() {
  const orders = useOrders();
  // the shopper now sees every order an unanswered checkout may have made: the next checkout is a new order
  useEffect(() => {
    if (orders.isSuccess) closeAllCheckoutKeys();
  }, [orders.isSuccess]);
  const [params, setParams] = useSearchParams();
  const shown = shownOrders(params.get('show'));
  const list = orders.data ?? [];
  const rows = useRef<HTMLUListElement>(null);
  // the first row "Show older" added takes focus: the button may be gone, which would drop focus to the page
  const focusRow = useRef<number | null>(null);
  useEffect(() => {
    const index = focusRow.current;
    if (index === null) return;
    focusRow.current = null;
    rows.current?.querySelectorAll<HTMLAnchorElement>(':scope > li > a')[index]?.focus();
  }, [shown]);
  const showOlder = () => {
    focusRow.current = shown;
    setParams(
      (p) => {
        p.set('show', String(shown + ORDERS_PAGE));
        return p;
      },
      { replace: true, preventScrollReset: true },
    );
  };
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <PageTitle>Orders</PageTitle>
      <div className="mb-8 space-y-1 border-b border-ink pb-4">
        <AccountCrumb page="Orders" />
        <h1 className="font-expanded text-4xl font-extrabold uppercase">Orders</h1>
      </div>
      {orders.isPending && (
        <div className="space-y-2">
          <p className="font-mono text-sm text-ink-3">Loading orders…</p>
          <SlowServerNote />
        </div>
      )}
      {orders.isError && (
        <Notice tone="error">
          {orders.error.message}{' '}
          <button
            type="button"
            className="min-h-11 font-semibold underline"
            onClick={() => void orders.refetch()}
          >
            Try again
          </button>
        </Notice>
      )}
      {orders.data?.length === 0 && (
        <div className="space-y-3">
          <p className="text-ink-2">No orders yet.</p>
          <Link to="/products" className="font-semibold underline underline-offset-4">
            Browse the catalogue
          </Link>
        </div>
      )}
      {list.length > 0 && (
        <>
          <ul ref={rows} className="border-t border-ink">
            {list.slice(0, shown).map((o) => (
              <li key={o.number}>
                <Link
                  to={`/orders/${o.number}`}
                  className="grid gap-x-6 gap-y-1 border-b border-bench px-1 py-4 hover:bg-alu-50 sm:grid-cols-[minmax(0,1fr)_11rem_9rem] sm:items-center"
                >
                  <span className="space-y-0.5">
                    <span className="block font-mono font-semibold">{o.number}</span>
                    <span className="block text-sm text-ink-3">
                      {formatDateTime(o.createdAt)} · {o.itemCount} {o.itemCount === 1 ? 'item' : 'items'}
                    </span>
                  </span>
                  <OrderStatusBadge status={o.status} />
                  <Price amount={o.total} className="sm:justify-self-end" />
                </Link>
              </li>
            ))}
          </ul>
          {list.length > shown && (
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <p className="font-mono text-xs text-ink-3">Showing the latest {shown}</p>
              <Button variant="secondary" onClick={showOlder}>
                Show older
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
