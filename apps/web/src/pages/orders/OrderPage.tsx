import { paymentMethodLabel } from '@gear-store/shared';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { AddressLines } from '../../components/checkout/AddressForm';
import { OrderStatusBadge } from '../../components/checkout/OrderStatusBadge';
import { ProductArt } from '../../components/product/ProductArt';
import { Button } from '../../components/ui/Button';
import { Notice } from '../../components/ui/Field';
import { Label } from '../../components/ui/Label';
import { Price } from '../../components/ui/Price';
import { ApiError } from '../../lib/api';
import { formatDateTime } from '../../lib/date';
import { statusLabels } from '../../lib/order-status';
import { useOrder, useOrderActions } from '../../lib/orders';
import { NotFoundPage } from '../NotFoundPage';

function useMinutesLeft(deadline: string | undefined): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!deadline) return;
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, [deadline]);
  if (!deadline) return null;
  return Math.max(0, Math.ceil((new Date(deadline).getTime() - now) / 60_000));
}

export function OrderPage() {
  const { number = '' } = useParams();
  const [params] = useSearchParams();
  const order = useOrder(number);
  const { pay, checkStatus, cancel } = useOrderActions(number);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const minutesLeft = useMinutesLeft(order.data?.canPay ? order.data.paymentExpiresAt : undefined);

  // back from the Midtrans page (it adds transaction_status to our URL): ask for the result once,
  // because on localhost the webhook cannot reach us and in production it may still be on its way
  const checked = useRef(false);
  const returnedFromPayment = params.has('transaction_status');
  useEffect(() => {
    if (returnedFromPayment && order.data?.status === 'PENDING_PAYMENT' && !checked.current) {
      checked.current = true;
      checkStatus.mutate();
    }
  }, [returnedFromPayment, order.data?.status, checkStatus]);

  if (order.error instanceof ApiError && (order.error.status === 404 || order.error.status === 400))
    return <NotFoundPage />;
  if (order.isError) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <Notice tone="error">{order.error.message}</Notice>
      </div>
    );
  }
  if (!order.data)
    return (
      <p className="mx-auto max-w-7xl px-4 py-16 font-mono text-sm text-ink-3 sm:px-6">Loading order…</p>
    );
  const o = order.data;
  const actionError = pay.error ?? checkStatus.error ?? cancel.error;

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <nav aria-label="Breadcrumb" className="mb-6 font-mono text-xs text-ink-3">
        <Link to="/orders" className="hover:text-ink">
          Orders
        </Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page" className="text-ink">
          {o.number}
        </span>
      </nav>

      <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-ink pb-4">
        <div className="space-y-2">
          <Label>Placed {formatDateTime(o.createdAt)}</Label>
          <h1 className="font-expanded text-3xl font-extrabold uppercase tabular">{o.number}</h1>
        </div>
        <OrderStatusBadge status={o.status} />
      </header>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-8">
          {o.canPay && (
            <section aria-labelledby="pay-title" className="space-y-3 border border-ink bg-alu-50 p-4 sm:p-6">
              <h2 id="pay-title" className="font-semibold">
                Pay <Price amount={o.total} /> before {formatDateTime(o.paymentExpiresAt)}
              </h2>
              <p className="text-sm text-ink-2" aria-live="polite">
                {minutesLeft} {minutesLeft === 1 ? 'minute' : 'minutes'} left. After that the order expires
                and the items go back on sale.
              </p>
              {params.get('payment') === 'unavailable' && !pay.isPending && (
                <Notice tone="error">
                  The order is placed, but the payment page could not be opened. Try again below.
                </Notice>
              )}
              {actionError && <Notice tone="error">{actionError.message}</Notice>}
              <div className="flex flex-wrap gap-3">
                <Button disabled={pay.isPending} onClick={() => pay.mutate()}>
                  {pay.isPending ? 'Opening payment…' : 'Pay now'}
                </Button>
                <Button
                  variant="secondary"
                  disabled={checkStatus.isPending}
                  onClick={() => checkStatus.mutate()}
                >
                  {checkStatus.isPending ? 'Checking…' : 'I have paid: check status'}
                </Button>
              </div>
              {!confirmCancel ? (
                <Button variant="ghost" onClick={() => setConfirmCancel(true)}>
                  Cancel order
                </Button>
              ) : (
                <div
                  role="group"
                  aria-label="Confirm cancellation"
                  className="flex flex-wrap items-center gap-3 text-sm"
                >
                  <span>Cancel this order? The items go back on sale.</span>
                  <Button variant="secondary" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
                    Yes, cancel
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirmCancel(false)}>
                    Keep it
                  </Button>
                </div>
              )}
            </section>
          )}
          {o.status === 'PAID' && checkStatus.isSuccess && (
            <Notice tone="ok">Payment received. Thank you!</Notice>
          )}

          <section aria-labelledby="items-title">
            <h2 id="items-title" className="mb-2 font-mono text-xs uppercase tracking-[0.08em] text-ink-3">
              Items
            </h2>
            <ul className="border-t border-ink">
              {o.items.map((i) => (
                <li
                  key={`${i.slug}:${i.colorLabel}`}
                  className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-bench py-3"
                >
                  <div className="bg-grid grid aspect-square place-items-center border border-bench">
                    <ProductArt category={i.category ?? ''} className="w-4/5" />
                  </div>
                  <div className="min-w-0 text-sm">
                    <Link to={`/products/${i.slug}`} className="font-semibold hover:underline">
                      {i.name}
                    </Link>
                    <p className="font-mono text-xs text-ink-3">
                      {i.quantity} × <Price amount={i.unitPrice} className="font-normal" /> · {i.model}
                      {i.colorLabel && ` · ${i.colorLabel}`}
                    </p>
                  </div>
                  <Price amount={i.lineTotal} className="text-sm" />
                </li>
              ))}
            </ul>
            <dl className="ml-auto mt-3 max-w-xs space-y-1 text-sm">
              <div className="flex justify-between">
                <dt>Subtotal</dt>
                <dd>
                  <Price amount={o.subtotal} className="font-normal" />
                </dd>
              </div>
              <div className="flex justify-between">
                <dt>Shipping</dt>
                <dd>
                  <Price amount={o.shippingFee} className="font-normal" />
                </dd>
              </div>
              <div className="flex justify-between border-t border-ink pt-1 text-base font-semibold">
                <dt>Total</dt>
                <dd>
                  <Price amount={o.total} />
                </dd>
              </div>
            </dl>
          </section>
        </div>

        <aside className="space-y-8">
          <section aria-labelledby="ship-title" className="space-y-2 text-sm">
            <h2 id="ship-title" className="font-mono text-xs uppercase tracking-[0.08em] text-ink-3">
              Ship to
            </h2>
            <AddressLines address={o.shipping} />
          </section>
          {o.payment?.method && (
            <section className="space-y-1 text-sm">
              <h2 className="font-mono text-xs uppercase tracking-[0.08em] text-ink-3">Payment</h2>
              <p>{paymentMethodLabel(o.payment.method)}</p>
            </section>
          )}
          <section aria-labelledby="timeline-title">
            <h2 id="timeline-title" className="mb-3 font-mono text-xs uppercase tracking-[0.08em] text-ink-3">
              Timeline
            </h2>
            <ol className="space-y-4 border-l border-ink pl-4">
              {o.events.map((e, i) => (
                <li key={`${e.at}-${i}`} className="relative text-sm">
                  <span aria-hidden="true" className="absolute -left-[1.3rem] top-1.5 size-2 bg-ink" />
                  <p className="font-semibold">{statusLabels[e.status]}</p>
                  <p className="text-ink-2">{e.note}</p>
                  <p className="font-mono text-xs text-ink-3">{formatDateTime(e.at)}</p>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </div>
  );
}
