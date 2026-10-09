import { couriers, paymentMethodLabel, shipInputSchema, type ShipInput } from '@gear-store/shared';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { AddressLines } from '../../components/checkout/AddressForm';
import { OrderStatusBadge } from '../../components/checkout/OrderStatusBadge';
import { Button } from '../../components/ui/Button';
import { Field, Notice } from '../../components/ui/Field';
import { Label } from '../../components/ui/Label';
import { Price } from '../../components/ui/Price';
import { useAdminOrder, useAdminOrderActions } from '../../lib/admin';
import { formatDateTime } from '../../lib/date';
import { statusLabels } from '../../lib/order-status';

export function OrderAdminPage() {
  const { number = '' } = useParams();
  const order = useAdminOrder(number);
  const { ship, deliver, refund } = useAdminOrderActions(number);
  const o = order.data;
  if (order.isError) return <Notice tone="error">{order.error.message}</Notice>;
  if (!o) return <p className="font-mono text-sm text-ink-3">Loading…</p>;
  const actionError = ship.error ?? deliver.error ?? refund.error;

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-4 font-mono text-xs text-ink-3">
        <Link to="/admin/orders" className="hover:text-ink">
          Orders
        </Link>{' '}
        / <span className="text-ink">{o.number}</span>
      </nav>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-ink pb-4">
        <div className="space-y-1">
          <Label>
            {o.customer.name} · {o.customer.email}
          </Label>
          <h1 className="font-expanded text-2xl font-extrabold uppercase sm:text-3xl">{o.number}</h1>
        </div>
        <OrderStatusBadge status={o.status} />
      </div>

      <div className="grid gap-10 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-8">
          {actionError && <Notice tone="error">{actionError.message}</Notice>}
          {o.status === 'PAID' && <ShipForm pending={ship.isPending} onShip={ship.mutate} />}
          {o.status === 'SHIPPED' && (
            <section className="space-y-3 border border-ink bg-alu-50 p-4">
              <p className="text-sm">
                Shipped with {o.fulfilment.courier}, tracking{' '}
                <span className="font-mono">{o.fulfilment.trackingNumber}</span>.
              </p>
              <Button disabled={deliver.isPending} onClick={deliver.mutate}>
                Mark delivered
              </Button>
            </section>
          )}
          {o.refundStatus === 'NEEDED' && (
            <section className="space-y-3 border border-danger bg-alu-50 p-4">
              <p className="text-sm">
                <strong className="text-danger">Refund needed.</strong> A payment arrived after this order
                closed. Refund <Price amount={o.total} className="font-normal" /> from the Midtrans dashboard,
                then record it here.
              </p>
              <Button variant="secondary" disabled={refund.isPending} onClick={refund.mutate}>
                Record refund
              </Button>
            </section>
          )}

          <section>
            <h2 className="mb-2 font-mono text-xs uppercase tracking-[0.08em] text-ink-3">Items</h2>
            <table className="w-full text-sm">
              <tbody>
                {o.items.map((i) => (
                  <tr key={`${i.slug}:${i.colorLabel}`} className="border-b border-bench">
                    <td className="py-2">
                      {i.name}
                      <span className="block font-mono text-xs text-ink-3">
                        {i.model}
                        {i.colorLabel && ` · ${i.colorLabel}`}
                      </span>
                    </td>
                    <td className="tabular py-2 text-right font-mono">{i.quantity} ×</td>
                    <td className="py-2 text-right">
                      <Price amount={i.lineTotal} className="font-normal" />
                    </td>
                  </tr>
                ))}
                <tr>
                  <td className="py-2 text-ink-2" colSpan={2}>
                    Shipping
                  </td>
                  <td className="py-2 text-right">
                    <Price amount={o.shippingFee} className="font-normal" />
                  </td>
                </tr>
                <tr className="border-t border-ink font-semibold">
                  <td className="py-2" colSpan={2}>
                    Total
                  </td>
                  <td className="py-2 text-right">
                    <Price amount={o.total} />
                  </td>
                </tr>
              </tbody>
            </table>
          </section>
        </div>

        <aside className="space-y-8 text-sm">
          <section className="space-y-2">
            <h2 className="font-mono text-xs uppercase tracking-[0.08em] text-ink-3">Ship to</h2>
            <AddressLines address={o.shipping} />
          </section>
          {o.payment?.method && (
            <section className="space-y-1">
              <h2 className="font-mono text-xs uppercase tracking-[0.08em] text-ink-3">Payment</h2>
              <p>{paymentMethodLabel(o.payment.method)}</p>
            </section>
          )}
          <section>
            <h2 className="mb-3 font-mono text-xs uppercase tracking-[0.08em] text-ink-3">Timeline</h2>
            <ol className="space-y-3 border-l border-ink pl-4">
              {o.events.map((e, i) => (
                <li key={`${e.at}-${i}`}>
                  <p className="font-semibold">{statusLabels[e.status]}</p>
                  <p className="text-ink-2">{e.note}</p>
                  <p className="font-mono text-xs text-ink-3">{formatDateTime(e.at)}</p>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </>
  );
}

function ShipForm({ pending, onShip }: { pending: boolean; onShip: (input: ShipInput) => void }) {
  const [courier, setCourier] = useState('');
  const [tracking, setTracking] = useState('');
  const [errors, setErrors] = useState<Partial<Record<keyof ShipInput, string>>>({});
  return (
    <form
      noValidate
      className="space-y-4 border border-ink bg-alu-50 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        const parsed = shipInputSchema.safeParse({ courier, trackingNumber: tracking });
        if (!parsed.success) {
          const next: typeof errors = {};
          for (const i of parsed.error.issues) next[i.path[0] as keyof ShipInput] ??= i.message;
          setErrors(next);
          return;
        }
        setErrors({});
        onShip(parsed.data);
      }}
    >
      <h2 className="font-semibold">Ship this order</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="courier" className="font-mono text-xs uppercase tracking-[0.08em] text-ink-2">
            Courier
          </label>
          <select
            id="courier"
            value={courier}
            onChange={(e) => setCourier(e.target.value)}
            aria-invalid={errors.courier ? true : undefined}
            className={`min-h-11 border bg-alu-50 px-3 text-base sm:text-sm ${errors.courier ? 'border-danger' : 'border-bench-strong'}`}
          >
            <option value="">Choose…</option>
            {couriers.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          {errors.courier && <p className="text-sm text-danger">{errors.courier}</p>}
        </div>
        <Field
          label="Tracking number"
          value={tracking}
          onChange={(e) => setTracking(e.target.value)}
          error={errors.trackingNumber}
        />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? 'Saving…' : 'Mark shipped'}
      </Button>
    </form>
  );
}
