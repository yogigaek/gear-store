import type { ReactNode } from 'react';
import { Button } from '../components/ui/Button';
import { Label } from '../components/ui/Label';
import { Price } from '../components/ui/Price';
import { SpecPlate } from '../components/ui/SpecPlate';
import { StockNote } from '../components/ui/StockNote';
import { ProductCard } from '../components/product/ProductCard';
import type { ProductSummary } from '@gear-store/shared';

// a fixed copy of a seeded part, so this page documents the components without depending on the API
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

// the same names in both columns: `.surface-dark` (index.css) turns the light values over on store pages
const tokens = [
  { token: 'alu', dark: '#15181a', light: '#e4e6e6', use: 'Page ground' },
  { token: 'alu-50', dark: '#1d2124', light: '#f5f6f6', use: 'Cards, plates, raised surfaces' },
  { token: 'bench', dark: '#2e3438', light: '#c3c8ca', use: 'Hairlines, grid' },
  { token: 'bench-strong', dark: '#4a5359', light: '#9aa2a6', use: 'Input borders, disabled actions' },
  { token: 'ink', dark: '#f5f6f6', light: '#15181a', use: 'Text, strong rules' },
  { token: 'ink-2', dark: '#c3c8ca', light: '#3c4449', use: 'Secondary text' },
  { token: 'ink-3', dark: '#9aa2a6', light: '#555e63', use: 'Captions, labels' },
  { token: 'ok', dark: '#7fd49f', light: '#24683f', use: 'In stock, confirmations' },
  { token: 'danger', dark: '#ff8f80', light: '#a32a20', use: 'Out of stock, form errors' },
];

const fixed = [
  { token: 'signal', hex: '#f2c230', use: 'The one accent: the main action, focus rings, 3D hotspots' },
  { token: 'stage', hex: '#0b0d0e', use: 'The studio behind the 3D bike; also the footer’s ground' },
];

const rules = [
  'Numbers, prices, specs and model codes are always mono, with tabular figures.',
  'Headlines are expanded uppercase; body text stays normal width.',
  'Signal yellow is the one accent: the main action, focus rings, 3D hotspots and eyebrow labels.',
  'Borders and hairlines separate things. No drop shadows or gradients; blur only behind panels over the 3D bike.',
  'Corners are square or 2–4 px. No pill buttons; only the 3D hotspots are round.',
  '3D appears where it explains the product: the configurator and each part’s own page. Cards stay 2D.',
  'Stock is stated as a fact. No countdowns or "only 2 left!" pressure.',
];

const sections = [
  { id: 'rules', title: 'Rules' },
  { id: 'colour', title: 'Colour' },
  { id: 'type', title: 'Type' },
  { id: 'components', title: 'Components' },
] as const;

function Section({
  index,
  id,
  title,
  intro,
  children,
}: {
  index: number;
  id: string;
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="grid scroll-mt-20 gap-6 border-t border-ink py-12 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10"
    >
      <div className="space-y-2">
        <h2 id={`${id}-title`} className="flex items-baseline gap-3">
          <span className="tabular font-mono text-xs text-signal">{String(index).padStart(2, '0')}</span>
          <span className="font-expanded text-lg font-bold uppercase">{title}</span>
        </h2>
        <p className="max-w-[40ch] text-sm text-ink-3">{intro}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function Swatch({ hex, label }: { hex: string; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className="size-9 shrink-0 border border-bench-strong"
        style={{ backgroundColor: hex }}
      />
      <span className="font-mono text-xs">
        <span className="block text-ink-3 sm:hidden">{label}</span>
        {hex}
      </span>
    </div>
  );
}

function Specimen({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2 border-b border-bench py-6 first:pt-0 last:border-b-0 last:pb-0">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Demo({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-3">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

export function DesignSystemPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:py-14">
      <header className="space-y-4 pb-10">
        <Label className="text-signal">Rakit · design system</Label>
        <h1 className="font-expanded text-4xl font-extrabold uppercase sm:text-5xl">The bench</h1>
        <p className="max-w-[62ch] text-ink-2">
          An engineering bench in a dark workshop: graphite surfaces, light ink, hairline rules and one signal
          colour. Every page of the store is built from these parts.
        </p>
        <nav aria-label="On this page">
          <ul className="flex flex-wrap gap-2 pt-2">
            {sections.map((s, i) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="inline-flex min-h-11 items-center gap-2 border border-bench-strong px-3 font-mono text-xs uppercase tracking-[0.08em] text-ink-2 transition-colors hover:border-ink hover:text-ink"
                >
                  <span className="tabular text-ink-3">{String(i + 1).padStart(2, '0')}</span>
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <Section
        index={1}
        id="rules"
        title="Rules"
        intro="What every page keeps to, checked against the store as it ships."
      >
        <ol className="grid gap-px border border-bench bg-bench sm:grid-cols-2">
          {rules.map((r, i) => (
            <li key={r} className="flex gap-3 bg-alu-50 p-4 text-sm">
              <span className="tabular font-mono text-ink-3">{String(i + 1).padStart(2, '0')}</span>
              {r}
            </li>
          ))}
          {/* an odd count leaves the last row half empty: the filler keeps the grid's hairlines whole */}
          {rules.length % 2 === 1 && <li aria-hidden="true" className="hidden bg-alu-50 sm:block" />}
        </ol>
      </Section>

      <Section
        index={2}
        id="colour"
        title="Colour"
        intro="Components are written once against these names. Store pages draw the dark values; the light ones are the source they are turned over from."
      >
        <div className="space-y-8">
          <div className="border border-bench">
            <div className="hidden grid-cols-[9rem_1fr_1fr_minmax(0,1.4fr)] gap-4 border-b border-bench bg-alu-50 px-4 py-2 sm:grid">
              {['Token', 'Dark · store', 'Light · source', 'Use'].map((h) => (
                <Label key={h}>{h}</Label>
              ))}
            </div>
            <ul>
              {tokens.map((t) => (
                <li
                  key={t.token}
                  className="grid grid-cols-2 gap-x-4 gap-y-3 border-b border-bench px-4 py-3 last:border-b-0 sm:grid-cols-[9rem_1fr_1fr_minmax(0,1.4fr)] sm:items-center"
                >
                  <p className="col-span-2 font-mono text-sm font-semibold sm:col-span-1">{t.token}</p>
                  <Swatch hex={t.dark} label="Dark" />
                  <Swatch hex={t.light} label="Light" />
                  <p className="col-span-2 text-sm text-ink-2 sm:col-span-1">{t.use}</p>
                </li>
              ))}
            </ul>
          </div>
          <ul className="grid gap-px border border-bench bg-bench sm:grid-cols-2">
            {fixed.map((c) => (
              <li key={c.token} className="bg-alu-50">
                <div
                  aria-hidden="true"
                  className="h-20 border-b border-bench"
                  style={{ backgroundColor: c.hex }}
                />
                <div className="space-y-1 p-4">
                  <p className="flex items-baseline justify-between gap-3 font-mono text-sm">
                    <span className="font-semibold">{c.token}</span>
                    <span className="text-xs text-ink-3">{c.hex} · both grounds</span>
                  </p>
                  <p className="text-sm text-ink-2">{c.use}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      <Section
        index={3}
        id="type"
        title="Type"
        intro="Two variable families: Archivo for words, stretched for headlines, and JetBrains Mono for anything measured."
      >
        <div>
          <Specimen label="Display · Archivo 800, width 125%, uppercase">
            <p className="font-expanded text-display font-extrabold uppercase">Built to be taken apart</p>
          </Specimen>
          <Specimen label="Heading · Archivo 700, width 125%, uppercase">
            <p className="font-expanded text-2xl font-bold uppercase">Every part, listed</p>
          </Specimen>
          <Specimen label="Body · Archivo 400, 16 px / 1.5">
            <p className="max-w-[60ch]">
              A 29-inch trail bike with a mid-drive motor, every part of it listed, priced, and serviceable
              with the tools in a home workshop.
            </p>
          </Specimen>
          <Specimen label="Data · JetBrains Mono 400–600, tabular figures">
            <p className="tabular font-mono">750 Wh · up to 135 km · 0–80 % in 4 h · Rp 11.900.000</p>
          </Specimen>
        </div>
      </Section>

      <Section
        index={4}
        id="components"
        title="Components"
        intro="The pieces the store is assembled from, shown with a real part from the catalogue."
      >
        <div className="grid gap-px border border-bench bg-bench lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="space-y-8 bg-alu-50 p-5 sm:p-6">
            <Demo label="Buttons · primary, secondary, text, disabled">
              <div className="flex flex-wrap items-center gap-3">
                <Button>Add to cart</Button>
                <Button variant="secondary">All parts</Button>
                <Button variant="ghost">View specs</Button>
                <Button disabled>Out of stock</Button>
              </div>
            </Demo>
            <Demo label="Spec plate">
              <SpecPlate specs={sample.plate} />
            </Demo>
            <Demo label="Price and stock">
              <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
                <Price amount={sample.price} className="text-2xl" />
                <StockNote stock={sample.stock} />
                <StockNote stock={0} />
              </div>
            </Demo>
          </div>
          <div className="space-y-3 bg-alu-50 p-5 sm:p-6">
            <Label>Product card</Label>
            <div className="max-w-xs">
              <ProductCard product={sample} />
            </div>
          </div>
        </div>
      </Section>
    </div>
  );
}
