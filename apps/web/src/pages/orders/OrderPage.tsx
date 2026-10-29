import { paymentMethodLabel, type OrderDetail } from '@gear-store/shared';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { AddressLines } from '../../components/checkout/AddressForm';
import { OrderStatusBadge } from '../../components/checkout/OrderStatusBadge';
import { PartImage } from '../../components/product/PartImage';
import { LineList, type Line } from '../../components/checkout/LineList';
import { Button } from '../../components/ui/Button';
import { SandboxPaymentGuide } from '../../components/checkout/SandboxPaymentGuide';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Notice } from '../../components/ui/Field';
import { Label } from '../../components/ui/Label';
import { PageTitle } from '../../components/ui/PageTitle';
import { Price } from '../../components/ui/Price';
import { ApiError } from '../../lib/api';
import { formatDateTime } from '../../lib/date';
import { groupOrderLines } from '../../lib/order-lines';
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
  const order = useOrder(number, { watchPayment: true });
  const { pay, checkStatus, pullStatus, cancel } = useOrderActions(number);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const minutesLeft = useMinutesLeft(order.data?.canPay ? order.data.paymentExpiresAt : undefined);
  // A payment page has been opened for this order: it is read every few seconds (useOrder) until it settles,
  // and once a minute Midtrans is also asked directly, in case the webhook is late.
  const awaitingPayment = Boolean(order.data?.canPay && order.data.payment);

  const pull = pullStatus.mutate; // stable across renders, so the minute timer is not restarted by them
  useEffect(() => {
    if (!awaitingPayment) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') pull();
    }, 60_000);
    return () => window.clearInterval(id);
  }, [awaitingPayment, pull]);

  // back from the Midtrans page (it adds transaction_status to our URL): ask for the result once,
  // because on localhost the webhook cannot reach us and in production it may still be on its way
  const checked = useRef(false);
  const returnedFromPayment = params.has('transaction_status');
  // the thank-you is for a payment that lands while the buyer is here, or on their way back from Midtrans
  const orderStatus = order.data?.status;
  const [seenStatus, setSeenStatus] = useState(orderStatus);
  const [paidHere, setPaidHere] = useState(false);
  if (orderStatus !== seenStatus) {
    setSeenStatus(orderStatus);
    if (seenStatus === 'PENDING_PAYMENT' && orderStatus === 'PAID') setPaidHere(true);
  }
  const thanks = orderStatus === 'PAID' && (paidHere || returnedFromPayment);
  useEffect(() => {
    if (returnedFromPayment && order.data?.status === 'PENDING_PAYMENT' && !checked.current) {
      checked.current = true;
      checkStatus.mutate();
    }
  }, [returnedFromPayment, order.data?.status, checkStatus]);

  if (order.error instanceof ApiError && (order.error.status === 404 || order.error.status === 400))
    return <NotFoundPage title="Order not found" />;
  if (order.isError) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <PageTitle>Order</PageTitle>
        <Notice tone="error">{order.error.message}</Notice>
      </div>
    );
  }
  if (!order.data)
    return (
      <p className="mx-auto max-w-7xl px-4 py-16 font-mono text-sm text-ink-3 sm:px-6">
        <PageTitle>Order</PageTitle>
        Loading order…
      </p>
    );
  const o = order.data;
  const actionError = pay.error ?? checkStatus.error ?? cancel.error;
  const notSetUp =
    params.get('payment') === 'not-set-up' ||
    (pay.error instanceof ApiError && pay.error.code === 'PAYMENTS_NOT_SET_UP');

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <PageTitle>{`Order ${o.number}`}</PageTitle>
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
              {notSetUp ? (
                <Notice tone="error">
                  The order is placed, but online payment is not set up on this demo server yet, so it cannot
                  be paid here. It stays reserved until the time above runs out.
                </Notice>
              ) : (
                params.get('payment') === 'unavailable' &&
                !pay.isPending && (
                  <Notice tone="error">
                    The order is placed, but the payment page could not be opened. Try again below.
                  </Notice>
                )
              )}
              {actionError && !notSetUp && <Notice tone="error">{actionError.message}</Notice>}
              {!notSetUp && (
                <>
                  <p className="text-sm text-ink-2">
                    <strong className="text-ink">Pay now</strong> opens the Midtrans sandbox page in this tab.
                    When you are done there, come back to this page.
                  </p>
                  <SandboxPaymentGuide />
                </>
              )}
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
              <Button variant="ghost" onClick={() => setConfirmCancel(true)}>
                Cancel order
              </Button>
              <ConfirmDialog
                open={confirmCancel}
                title="Cancel this order?"
                confirmLabel="Yes, cancel"
                cancelLabel="Keep it"
                danger
                pending={cancel.isPending}
                onCancel={() => setConfirmCancel(false)}
                onConfirm={() => cancel.mutate(undefined, { onSettled: () => setConfirmCancel(false) })}
              >
                The items go back on sale and the order closes. Nothing has been charged.
              </ConfirmDialog>
            </section>
          )}
          {thanks && <Notice tone="ok">Payment received. Thank you!</Notice>}

          <section aria-labelledby="items-title">
            <h2 id="items-title" className="mb-2 font-mono text-xs uppercase tracking-[0.08em] text-ink-3">
              Items
            </h2>
            <LineList lines={orderLines(o)} className="border-y border-bench border-t-ink" />
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
          {o.fulfilment.trackingNumber && (
            <section className="space-y-1 text-sm">
              <h2 className="font-mono text-xs uppercase tracking-[0.08em] text-ink-3">Delivery</h2>
              <p>
                {o.fulfilment.courier} ·{' '}
                <span className="select-all font-mono">{o.fulfilment.trackingNumber}</span>
              </p>
              {o.fulfilment.deliveredAt ? (
                <p className="text-ink-2">Delivered {formatDateTime(o.fulfilment.deliveredAt)}</p>
              ) : (
                o.fulfilment.shippedAt && (
                  <p className="text-ink-2">Shipped {formatDateTime(o.fulfilment.shippedAt)}</p>
                )
              )}
            </section>
          )}
          {o.refundStatus !== 'NONE' && (
            <Notice tone={o.refundStatus === 'DONE' ? 'ok' : 'error'}>
              {o.refundStatus === 'DONE'
                ? 'Your late payment has been refunded.'
                : 'Your payment arrived after this order closed. It will be refunded.'}
            </Notice>
          )}
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

/** each bike (with the parts it was built from), then the parts bought on their own */
function orderLines(o: OrderDetail): Line[] {
  const { bikes, singles } = groupOrderLines(o);
  return [
    ...bikes.map(({ build, parts }) => ({
      key: `bike:${build.id}`,
      art: <PartImage slug="e1-bike" colorKey={build.colorKey} module="FRAME" className="size-full" />,
      name: build.label,
      what: `${parts.length} ${parts.length === 1 ? 'part' : 'parts'}`,
      finish: build.colorLabel,
      quantity: build.quantity,
      unitPrice: build.unitPrice,
      lineTotal: build.lineTotal,
      extra: (
        <ul className="mt-2 ml-[4.25rem] space-y-0.5 font-mono text-xs text-ink-2">
          {parts.map((p) => (
            <li key={p.slug} className="flex justify-between gap-3">
              <Link to={`/products/${p.slug}`} className="truncate hover:underline">
                {p.name}
              </Link>
              <span className="shrink-0 text-ink-3">{p.model}</span>
            </li>
          ))}
        </ul>
      ),
    })),
    ...singles.map((i) => ({
      key: `part:${i.slug}:${i.colorKey}`,
      art: (
        <PartImage slug={i.slug} colorKey={i.colorKey} module={i.module ?? undefined} className="size-full" />
      ),
      name: (
        <Link to={`/products/${i.slug}`} className="hover:underline">
          {i.name}
        </Link>
      ),
      what: i.model,
      finish: i.colorLabel,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      lineTotal: i.lineTotal,
    })),
  ];
}
