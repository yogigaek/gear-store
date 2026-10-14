import type { BuildCatalog, BuildSelection } from '@gear-store/shared';
import { useMutation } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useCart } from '../../lib/cart';
import { useBuildQuote } from '../../lib/queries';
import { cartDrawer } from '../cart/cart-drawer-store';
import { QuantityStepper } from '../cart/QuantityStepper';
import { Price } from '../ui/Price';

/** each option's reason it cannot join the parts chosen in the other slots, if any */
function blocked(catalog: BuildCatalog, parts: Record<string, string>): Map<string, string> {
  const chosen = new Set(Object.values(parts));
  const out = new Map<string, string>();
  for (const slot of catalog.slots) {
    const others = new Set([...chosen].filter((slug) => slug !== parts[slot.category]));
    for (const option of slot.options) {
      const clash = catalog.conflicts.find(
        (c) => (c.a === option.slug && others.has(c.b)) || (c.b === option.slug && others.has(c.a)),
      );
      if (clash) out.set(option.slug, clash.reason);
      else if (option.stock === 0) out.set(option.slug, 'Sold out.');
    }
  }
  return out;
}

/**
 * The E-1 configurator: a part for each slot, the frame's colour, a live price from the server and the way to
 * the cart. Options that would make the bike unbuildable stay visible, disabled, with the reason.
 */
export function Configurator({
  catalog,
  colorKey,
  onColor,
}: {
  catalog: BuildCatalog;
  colorKey: string;
  onColor: (key: string) => void;
}) {
  const [parts, setParts] = useState<Record<string, string>>(() =>
    Object.fromEntries(catalog.slots.flatMap((s) => (s.defaultSlug ? [[s.category, s.defaultSlug]] : []))),
  );
  const [quantity, setQuantity] = useState(1);
  const selection = useMemo<BuildSelection>(() => ({ parts, colorKey }), [parts, colorKey]);
  // checked for the number of bikes wanted, so a quantity beyond the stock shows before adding
  const quote = useBuildQuote(useMemo(() => ({ ...selection, quantity }), [selection, quantity]));
  const reasons = useMemo(() => blocked(catalog, parts), [catalog, parts]);
  const cart = useCart();
  const add = useMutation({
    mutationFn: () => cart.addBuild(selection, quantity),
    onSuccess: () => {
      setQuantity(1);
      cartDrawer.open();
    },
  });

  const frame = catalog.slots[0]?.options.find((o) => o.slug === parts[catalog.slots[0]!.category]);
  const problems = quote.data?.problems ?? [];
  const ready = quote.data !== undefined && problems.length === 0 && !quote.isPlaceholderData;

  return (
    <form
      aria-labelledby="configure-title"
      className="flex max-h-full min-h-0 flex-col border border-ink-2 bg-stage/90 backdrop-blur-sm"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready && !add.isPending) add.mutate();
      }}
    >
      <div className="border-b border-ink-2 px-5 py-4">
        <p className="font-mono text-[0.72rem] uppercase tracking-[0.08em] text-signal">Configure</p>
        <h2 id="configure-title" className="font-expanded text-2xl font-extrabold uppercase leading-none">
          Build your {catalog.name.replace('Rakit ', '')}
        </h2>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
        {frame && frame.colors.length > 0 && (
          <fieldset className="space-y-2">
            <legend className="font-mono text-xs uppercase tracking-[0.08em] text-bench">
              Colour ·{' '}
              <span className="text-alu-50">{frame.colors.find((c) => c.key === colorKey)?.label}</span>
            </legend>
            <div className="flex flex-wrap gap-2">
              {frame.colors.map((c) => (
                <label
                  key={c.key}
                  title={c.label}
                  className="grid size-11 cursor-pointer place-items-center border border-transparent has-checked:border-alu-50 has-focus-visible:outline-3 has-focus-visible:outline-signal"
                >
                  <input
                    type="radio"
                    name="build-colour"
                    value={c.key}
                    checked={c.key === colorKey}
                    onChange={() => onColor(c.key)}
                    className="sr-only"
                    aria-label={c.label}
                  />
                  <span className="size-7 border border-ink-2" style={{ backgroundColor: c.hex }} />
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {catalog.slots.map((slot) => {
          const wrong = problems.some((p) => p.slots.includes(slot.category));
          return (
            <fieldset key={slot.category} className="space-y-1.5">
              <legend
                className={`font-mono text-xs uppercase tracking-[0.08em] ${wrong ? 'text-danger' : 'text-bench'}`}
              >
                {slot.name}
              </legend>
              {slot.options.map((option) => {
                const reason = reasons.get(option.slug);
                const checked = parts[slot.category] === option.slug;
                return (
                  <label
                    key={option.slug}
                    className={`flex min-h-11 items-center gap-3 border px-3 py-2 text-sm ${
                      checked ? 'border-signal' : 'border-ink-2'
                    } ${reason && !checked ? 'cursor-not-allowed opacity-55' : 'cursor-pointer hover:border-bench'}`}
                  >
                    <input
                      type="radio"
                      name={`slot-${slot.category}`}
                      value={option.slug}
                      checked={checked}
                      disabled={!!reason && !checked}
                      onChange={() => setParts((p) => ({ ...p, [slot.category]: option.slug }))}
                      className="size-4 shrink-0 accent-signal"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-alu-50">{option.name}</span>
                      <span className="block text-xs text-bench">
                        {reason && !checked ? reason : option.plate.map((s) => s.value).join(' · ')}
                      </span>
                    </span>
                    <Price amount={option.price} className="shrink-0 text-alu-50" />
                  </label>
                );
              })}
            </fieldset>
          );
        })}
      </div>

      <div className="space-y-3 border-t border-ink-2 px-5 py-4">
        {problems.length > 0 && (
          <ul role="status" className="space-y-1 text-sm text-danger">
            {problems.map((p) => (
              <li key={`${p.kind}:${p.slots.join()}`}>{p.message}</li>
            ))}
          </ul>
        )}
        {add.error && <p className="text-sm text-danger">{add.error.message}</p>}
        <div className="flex items-baseline justify-between gap-3" aria-live="polite">
          <span className="font-mono text-xs uppercase tracking-[0.08em] text-bench">Your E-1</span>
          {quote.data ? (
            <Price amount={quote.data.unitPrice * quantity} className="text-2xl text-alu-50" />
          ) : (
            <span className="font-mono text-sm text-bench">Pricing…</span>
          )}
        </div>
        <div className="flex gap-3">
          <QuantityStepper label="Number of bikes" value={quantity} onChange={setQuantity} dark />
          <button
            type="submit"
            aria-disabled={!ready || add.isPending || undefined}
            className="min-h-11 flex-1 bg-signal px-5 font-semibold uppercase tracking-[0.06em] text-ink aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
          >
            {add.isPending ? 'Adding…' : 'Add to cart'}
          </button>
        </div>
        <p className="text-xs text-bench">Priced and checked on our server at today’s prices. Demo store.</p>
      </div>
    </form>
  );
}
