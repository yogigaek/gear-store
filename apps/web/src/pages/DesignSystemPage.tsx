import { Button } from '../components/ui/Button';
import { Label } from '../components/ui/Label';
import { Price } from '../components/ui/Price';
import { SpecPlate } from '../components/ui/SpecPlate';
import { StockNote } from '../components/ui/StockNote';
import { ProductCard } from '../components/product/ProductCard';
import type { ProductSummary } from '@gear-store/shared';

// a fixed sample, so this page documents the components without depending on the API
const sample: ProductSummary = {
  slug: 'e1-battery-750',
  name: 'Battery 750 Wh',
  model: 'BT-750',
  category: 'batteries',
  module: 'BATTERY',
  price: 11_900_000,
  stock: 6,
  plate: [
    { label: 'Capacity', value: '750 Wh' },
    { label: 'Range', value: 'up to 135 km' },
    { label: 'Charge', value: '0–80 % in 4 h' },
  ],
};

const colors = [
  { token: 'alu', hex: '#e4e6e6', use: 'Page ground' },
  { token: 'alu-50', hex: '#f5f6f6', use: 'Cards, plates, raised surfaces' },
  { token: 'bench', hex: '#c3c8ca', use: 'Hairlines, grid' },
  { token: 'ink', hex: '#15181a', use: 'Text, primary action, strong rules' },
  { token: 'ink-2', hex: '#3c4449', use: 'Secondary text' },
  { token: 'ink-3', hex: '#555e63', use: 'Captions, labels' },
  { token: 'signal', hex: '#f2c230', use: 'Interaction only: focus, hotspots, primary underline' },
  { token: 'ok / danger', hex: '#24683f', use: 'Stock state, form errors (#a32a20)' },
];

const rules = [
  'Numbers, prices, specs and model codes are always mono.',
  'Headlines are expanded uppercase; body text stays normal width.',
  'Signal yellow marks interaction. It never carries text on a light ground.',
  'Borders and hairlines separate things. No soft drop shadows, gradients or blur.',
  'Corners are square or 2–4 px. No pill buttons.',
  '3D appears where it explains the product: the exploded view and the hero. Cards stay 2D.',
  'Stock is stated as a fact. No countdowns or "only 2 left!" pressure.',
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-6 border-t border-ink py-10 lg:grid-cols-[14rem_1fr]">
      <h2 className="font-mono text-xs uppercase tracking-[0.08em] text-ink-3">{title}</h2>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

export function DesignSystemPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <header className="mb-10 space-y-3">
        <Label>Rakit · design system v0.1</Label>
        <h1 className="font-expanded text-4xl font-extrabold uppercase">The bench</h1>
        <p className="max-w-[60ch] text-ink-2">
          An engineering bench: aluminium ground, graphite ink, hairline rules, and one signal colour for
          interaction. Everything on the store is built from these parts.
        </p>
      </header>

      <Section title="Rules">
        <ol className="grid gap-2 sm:grid-cols-2">
          {rules.map((r, i) => (
            <li key={r} className="flex gap-3 border border-bench bg-alu-50 p-3 text-sm">
              <span className="tabular font-mono text-ink-3">{String(i + 1).padStart(2, '0')}</span>
              {r}
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Colour">
        <ul className="grid gap-px border border-bench bg-bench sm:grid-cols-2 lg:grid-cols-4">
          {colors.map((c) => (
            <li key={c.token} className="bg-alu-50">
              <div className="h-16 border-b border-bench" style={{ backgroundColor: c.hex }} />
              <div className="space-y-0.5 p-3">
                <p className="font-mono text-sm font-semibold">{c.token}</p>
                <p className="font-mono text-xs text-ink-3">{c.hex}</p>
                <p className="text-sm text-ink-2">{c.use}</p>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Type">
        <div className="space-y-6">
          <div>
            <Label>Display · Archivo 800, width 125%, uppercase</Label>
            <p className="font-expanded text-display font-extrabold uppercase">Built to be opened</p>
          </div>
          <div>
            <Label>Heading · Archivo 700, width 125%</Label>
            <p className="font-expanded text-2xl font-bold uppercase">On the bench</p>
          </div>
          <div>
            <Label>Body · Archivo 400, 16 px / 1.5</Label>
            <p className="max-w-[60ch]">
              A closed-back headphone with hybrid noise cancelling and a battery that lasts a working week.
            </p>
          </div>
          <div>
            <Label>Data · JetBrains Mono 400–600</Label>
            <p className="font-mono">40 mm · 60 h · 45 ms · Rp 1.249.000</p>
          </div>
        </div>
      </Section>

      <Section title="Components">
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <Button>Add to cart</Button>
              <Button variant="secondary">Compare</Button>
              <Button variant="ghost">View specs</Button>
              <Button disabled>Out of stock</Button>
            </div>
            <SpecPlate specs={sample.plate} />
            <div className="flex flex-wrap items-baseline gap-6">
              <Price amount={1249000} className="text-2xl" />
              <StockNote stock={14} />
              <StockNote stock={0} />
            </div>
          </div>
          <div className="max-w-xs">
            <ProductCard product={sample} />
          </div>
        </div>
      </Section>
    </div>
  );
}
