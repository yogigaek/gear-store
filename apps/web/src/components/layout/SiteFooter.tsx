import { usePageTone } from './page-tone';

export function SiteFooter() {
  const dark = usePageTone() === 'dark';
  return (
    <footer className={dark ? 'border-t border-ink-2 bg-stage' : 'mt-24 border-t border-ink'}>
      <div
        className={`mx-auto grid max-w-7xl gap-6 px-4 py-10 text-sm sm:grid-cols-[2fr_1fr_1fr] sm:px-6 ${dark ? 'text-bench' : 'text-ink-2'}`}
      >
        <div className="space-y-2">
          <p className={`font-expanded font-extrabold uppercase ${dark ? 'text-alu-50' : 'text-ink'}`}>
            Rakit
          </p>
          <p className="max-w-[42ch]">
            A portfolio project by Muhammad Yogi. This is a demo store: products, prices and stock are
            examples, and no real orders are taken.
          </p>
        </div>
        <div className="space-y-1">
          <p
            className={`font-mono text-xs uppercase tracking-[0.08em] ${dark ? 'text-alu-50' : 'text-ink-3'}`}
          >
            Payments
          </p>
          <p>Midtrans sandbox</p>
        </div>
        <div className="space-y-1">
          <p
            className={`font-mono text-xs uppercase tracking-[0.08em] ${dark ? 'text-alu-50' : 'text-ink-3'}`}
          >
            Prices
          </p>
          <p>Indonesian Rupiah, VAT included</p>
        </div>
      </div>
    </footer>
  );
}
