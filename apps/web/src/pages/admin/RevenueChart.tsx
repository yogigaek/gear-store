import type { AdminStats } from '@gear-store/shared';
import { useEffect, useId, useRef, useState } from 'react';
import { formatRupiah } from '../../lib/format';

const H = 180; // plot height in px
const TOP = 10; // room above the plot so the top tick label is not cut
const LEFT = 64; // room for y-axis labels
const BOTTOM = 24; // room for x-axis labels

/** "Rp 1,2 jt" style: short y-axis labels; the tooltip and table carry the exact amounts. */
function short(amount: number): string {
  if (amount >= 1_000_000)
    return `${(amount / 1_000_000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jt`;
  if (amount >= 1_000) return `${Math.round(amount / 1_000)} rb`;
  return String(amount);
}

/** 1, 2 or 5 × 10^n: ticks land on round numbers */
function niceMax(value: number): number {
  if (value <= 0) return 1_000_000;
  const p = 10 ** Math.floor(Math.log10(value));
  return [1, 2, 5, 10].map((m) => m * p).find((m) => m >= value) ?? 10 * p;
}

const dayLabel = (iso: string) =>
  new Date(`${iso}T00:00:00+07:00`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Jakarta',
  });

/**
 * Daily revenue as columns: one series in ink, so no legend (the heading names it). Each column is a hover
 * and focus target taller than the mark; a table carries the same numbers for screen readers.
 */
export function RevenueChart({ daily }: { daily: AdminStats['daily'] }) {
  const [active, setActive] = useState<number | null>(null);
  const titleId = useId();
  // drawn at the container's real width, so 11px text stays 11px instead of scaling with the SVG
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(280, Math.round(entry!.contentRect.width))),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const max = niceMax(Math.max(...daily.map((d) => d.revenue)));
  const ticks = [0, max / 2, max];
  const band = (width - LEFT) / daily.length;
  const barW = Math.max(2, Math.min(24, band - 2)); // capped at 24px; at least a 2px gap between columns
  // about one date label per 90px, so they never collide
  const labelEvery = Math.max(1, Math.ceil(daily.length / Math.max(2, Math.floor((width - LEFT) / 90))));
  const shown = active === null ? null : daily[active];

  return (
    <figure className="space-y-2" aria-labelledby={titleId}>
      <figcaption id={titleId} className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-mono text-xs uppercase tracking-[0.08em] text-ink-3">
          Revenue per day (WIB)
        </span>
        <span className="tabular min-h-5 font-mono text-xs text-ink-2" aria-live="polite">
          {shown
            ? `${dayLabel(shown.date)} · ${formatRupiah(shown.revenue)} · ${shown.orders} orders`
            : 'Hover a day for details'}
        </span>
      </figcaption>
      <div ref={box}>
        <svg
          width={width}
          height={TOP + H + BOTTOM}
          viewBox={`0 ${-TOP} ${width} ${TOP + H + BOTTOM}`}
          className="block"
          role="presentation"
        >
          {ticks.map((t) => {
            const y = H - (t / max) * H + 0.5;
            return (
              <g key={t}>
                <line x1={LEFT} x2={width} y1={y} y2={y} className="stroke-bench" strokeWidth={1} />
                <text
                  x={LEFT - 8}
                  y={y}
                  dy="0.32em"
                  textAnchor="end"
                  className="fill-ink-3 font-mono text-[11px]"
                >
                  {short(t)}
                </text>
              </g>
            );
          })}
          {daily.map((d, i) => {
            const h = d.revenue > 0 ? Math.max(2, (d.revenue / max) * H) : 0;
            const x = LEFT + i * band + (band - barW) / 2;
            const r = Math.min(4, barW / 2, h);
            return (
              <g
                key={d.date}
                tabIndex={0}
                role="img"
                aria-label={`${dayLabel(d.date)}: ${formatRupiah(d.revenue)}, ${d.orders} orders`}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                className="outline-none"
              >
                {/* the hit area is the whole day's band, full height: much bigger than a thin column */}
                <rect
                  x={LEFT + i * band}
                  y={0}
                  width={band}
                  height={H}
                  className={active === i ? 'fill-bench/40' : 'fill-transparent'}
                />
                {h > 0 && (
                  <path
                    // rounded data end at the top, square at the baseline
                    d={`M${x},${H} V${H - h + r} Q${x},${H - h} ${x + r},${H - h} H${x + barW - r} Q${x + barW},${H - h} ${x + barW},${H - h + r} V${H} Z`}
                    className="fill-ink"
                  />
                )}
                {i % labelEvery === 0 && (
                  <text
                    x={x + barW / 2}
                    y={H + 16}
                    textAnchor="middle"
                    className="fill-ink-3 font-mono text-[11px]"
                  >
                    {dayLabel(d.date)}
                  </text>
                )}
              </g>
            );
          })}
          <line x1={LEFT} x2={width} y1={H + 0.5} y2={H + 0.5} className="stroke-ink" strokeWidth={1} />
        </svg>
      </div>
      <table className="sr-only">
        <caption>Revenue per day</caption>
        <thead>
          <tr>
            <th>Day</th>
            <th>Revenue</th>
            <th>Orders</th>
          </tr>
        </thead>
        <tbody>
          {daily.map((d) => (
            <tr key={d.date}>
              <td>{dayLabel(d.date)}</td>
              <td>{formatRupiah(d.revenue)}</td>
              <td>{d.orders}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
