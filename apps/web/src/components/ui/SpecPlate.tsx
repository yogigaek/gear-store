import type { Spec } from '../../data/catalog';

/** The three numbers that define a product, set like a label stamped on the device. */
export function SpecPlate({ specs, className = '' }: { specs: readonly Spec[]; className?: string }) {
  return (
    <dl
      className={`grid border border-ink font-mono text-xs ${className}`}
      // columns never squeeze a value onto two lines ("20.000 mAh"); spare width is shared evenly
      style={{ gridTemplateColumns: `repeat(${specs.length}, minmax(max-content, 1fr))` }}
    >
      {specs.map((spec) => (
        <div key={spec.label} className="border-r border-ink px-2 py-1.5 last:border-r-0">
          <dt className="text-[0.62rem] uppercase tracking-[0.06em] text-ink-3">{spec.label}</dt>
          <dd className="tabular whitespace-nowrap font-semibold">{spec.value}</dd>
        </div>
      ))}
    </dl>
  );
}
