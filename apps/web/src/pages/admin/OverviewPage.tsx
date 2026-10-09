import { statsRanges } from '@gear-store/shared';
import { useState } from 'react';
import { Link } from 'react-router';
import { Notice } from '../../components/ui/Field';
import { Price } from '../../components/ui/Price';
import { useAdminStats } from '../../lib/admin';
import { formatRupiah } from '../../lib/format';
import { AdminHeading } from './AdminLayout';
import { RevenueChart } from './RevenueChart';

export function OverviewPage() {
  const [days, setDays] = useState<number>(30);
  const stats = useAdminStats(days);
  const s = stats.data;

  return (
    <>
      <AdminHeading title="Overview">
        <div role="radiogroup" aria-label="Period" className="flex border border-ink">
          {statsRanges.map((d) => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={days === d}
              onClick={() => setDays(d)}
              className={`min-h-11 px-4 font-mono text-xs uppercase tracking-[0.08em] ${days === d ? 'bg-ink text-alu-50' : 'hover:bg-alu-50'}`}
            >
              {d} days
            </button>
          ))}
        </div>
      </AdminHeading>

      {stats.isError && <Notice tone="error">{stats.error.message}</Notice>}
      {s && (
        <div className={`space-y-10 ${stats.isPlaceholderData ? 'opacity-60' : ''}`}>
          <section
            aria-label="Totals"
            className="grid gap-6 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]"
          >
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.08em] text-ink-3">
                Revenue, last {s.days} days
              </p>
              {/* the one hero figure on the page: proportional digits read tighter at this size */}
              <p className="text-5xl font-semibold tracking-tight">{formatRupiah(s.revenue)}</p>
            </div>
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.08em] text-ink-3">Paid orders</p>
              <p className="text-3xl font-semibold">{s.paidOrders}</p>
            </div>
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.08em] text-ink-3">Average order</p>
              <p className="text-3xl font-semibold">{formatRupiah(s.averageOrderValue)}</p>
            </div>
          </section>

          <RevenueChart daily={s.daily} />

          <div className="grid gap-10 lg:grid-cols-2">
            <section aria-labelledby="attention-title">
              <h2
                id="attention-title"
                className="mb-3 font-mono text-xs uppercase tracking-[0.08em] text-ink-3"
              >
                Needs attention
              </h2>
              <ul className="divide-y divide-bench border-y border-ink">
                <Attention
                  to="/admin/orders?status=PAID"
                  count={s.awaitingShipment}
                  label="paid orders to ship"
                />
                <Attention
                  to="/admin/orders?refund=needed"
                  count={s.refundsNeeded}
                  label="late payments to refund"
                  urgent
                />
                <Attention
                  to="/admin/orders?status=PENDING_PAYMENT"
                  count={s.awaitingPayment}
                  label="orders waiting for payment"
                  quiet
                />
              </ul>
              <h3 className="mb-2 mt-6 font-mono text-xs uppercase tracking-[0.08em] text-ink-3">
                Low stock
              </h3>
              {s.lowStock.length === 0 ? (
                <p className="text-sm text-ink-2">Every active product has more than 5 units.</p>
              ) : (
                <ul className="divide-y divide-bench border-y border-bench text-sm">
                  {s.lowStock.map((p) => (
                    <li key={p.slug}>
                      <Link
                        to={`/admin/products/${p.slug}`}
                        className="flex min-h-11 items-center justify-between gap-3 hover:bg-alu-50"
                      >
                        <span>
                          {p.name} <span className="font-mono text-xs text-ink-3">{p.model}</span>
                        </span>
                        <span className={`tabular font-mono ${p.stock === 0 ? 'text-danger' : ''}`}>
                          {p.stock === 0 ? 'Sold out' : `${p.stock} left`}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-labelledby="top-title">
              <h2 id="top-title" className="mb-3 font-mono text-xs uppercase tracking-[0.08em] text-ink-3">
                Best sellers, last {s.days} days
              </h2>
              {s.topProducts.length === 0 ? (
                <p className="text-sm text-ink-2">No paid orders in this period yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-ink text-left font-mono text-xs uppercase tracking-[0.06em] text-ink-3">
                      <th className="py-2 font-normal">Product</th>
                      <th className="py-2 text-right font-normal">Units</th>
                      <th className="py-2 text-right font-normal">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.topProducts.map((p) => (
                      <tr key={p.slug} className="border-b border-bench">
                        <td className="py-2">{p.name}</td>
                        <td className="tabular py-2 text-right font-mono">{p.quantity}</td>
                        <td className="py-2 text-right">
                          <Price amount={p.revenue} className="font-normal" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </div>
        </div>
      )}
    </>
  );
}

function Attention({
  to,
  count,
  label,
  urgent,
  quiet,
}: {
  to: string;
  count: number;
  label: string;
  urgent?: boolean;
  quiet?: boolean;
}) {
  // state is shown by the marker shape and words, not colour alone
  const tone = count === 0 || quiet ? 'text-ink-2' : urgent ? 'text-danger' : 'text-ink';
  return (
    <li>
      <Link to={to} className={`flex min-h-11 items-center gap-3 hover:bg-alu-50 ${tone}`}>
        <span
          aria-hidden="true"
          className={`size-2 ${count > 0 && !quiet ? (urgent ? 'bg-danger' : 'bg-ink') : 'border border-bench-strong'}`}
        />
        <span className="tabular w-8 font-mono font-semibold">{count}</span>
        <span>{label}</span>
      </Link>
    </li>
  );
}
