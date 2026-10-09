import { Link } from 'react-router';
import { ProductCard, ProductCardSkeleton } from '../components/product/ProductCard';
import { Label } from '../components/ui/Label';
import { useCategories, useProduct, useProducts } from '../lib/queries';
import { usePrefersReducedMotion } from '../three/useCanRender3D';
import { Viewer3D } from '../three/Viewer3D';

const HERO_SLUG = 'h-40-anc-headphone';
const ALUMINIUM = '#b9bfc2';

export function HomePage() {
  const reducedMotion = usePrefersReducedMotion();
  const hero = useProduct(HERO_SLUG).data;
  const categories = useCategories();
  const latest = useProducts({ sort: 'newest', pageSize: 8 });
  // aluminium shows the screws and drivers on the light bench; graphite reads as a silhouette
  const finish = hero?.colors.find((c) => c.key === 'aluminium');

  return (
    <>
      <section className="border-b border-ink">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:py-20">
          <div className="space-y-6">
            <Label>Audio · keyboards · power · hubs</Label>
            <h1 className="font-expanded text-display font-extrabold uppercase">
              Built to
              <br />
              be opened.
            </h1>
            <p className="max-w-[44ch] text-lg text-ink-2">
              Headphones, keyboards and chargers, listed with every spec on the label and the parts you can
              replace yourself.
            </p>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <Link
                to="/products"
                className="inline-flex min-h-11 items-center border-b-[3px] border-signal bg-ink px-5 text-sm font-semibold uppercase tracking-[0.06em] text-alu-50 hover:bg-ink-2"
              >
                Shop the bench
              </Link>
              <Link
                to={`/products/${HERO_SLUG}`}
                className="min-h-11 content-center text-sm font-semibold underline decoration-bench-strong underline-offset-4 hover:decoration-ink"
              >
                Take the H-40 apart
              </Link>
            </div>
          </div>

          <figure className="bg-grid relative border border-bench">
            <div className="aspect-[5/4]">
              <Viewer3D
                category="audio"
                explode={0}
                shellColor={finish?.hex ?? ALUMINIUM}
                assembleOnMount={!reducedMotion}
                interactive={false}
                label="Over-ear ANC Headphone H-40, three-quarter view"
              />
            </div>
            <figcaption className="flex flex-wrap items-baseline justify-between gap-2 border-t border-bench bg-alu-50 px-4 py-3">
              <span className="text-sm font-semibold">
                {hero ? `${hero.name} · ${hero.model}` : 'H-40'} · {finish?.label ?? 'Aluminium'}
              </span>
              <span className="font-mono text-xs text-ink-3">8 parts · 8 screws · no glue</span>
            </figcaption>
          </figure>
        </div>
      </section>

      <section aria-labelledby="cat-title" className="mx-auto max-w-7xl px-4 pt-14 sm:px-6">
        <h2 id="cat-title" className="sr-only">
          Categories
        </h2>
        <ul className="grid min-h-[7.5rem] grid-cols-2 border-l border-t border-ink lg:grid-cols-4">
          {categories.data?.map((c) => (
            <li key={c.slug} className="border-b border-r border-ink">
              <Link
                to={`/products?category=${c.slug}`}
                className="group flex h-full flex-col gap-1 p-4 hover:bg-alu-50 sm:p-5"
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold group-hover:underline">{c.name}</span>
                  <span className="tabular font-mono text-xs text-ink-3">{c.productCount}</span>
                </span>
                <span className="text-sm text-ink-2">{c.description}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="new-title" className="mx-auto max-w-7xl px-4 pt-14 sm:px-6">
        <div className="mb-6 flex items-baseline justify-between gap-4">
          <h2 id="new-title" className="font-expanded text-2xl font-bold uppercase">
            On the bench
          </h2>
          <Link
            to="/products"
            className="font-mono text-xs uppercase tracking-[0.08em] underline underline-offset-4"
          >
            All {latest.data?.total ?? ''} products
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {latest.isPending && Array.from({ length: 4 }, (_, i) => <ProductCardSkeleton key={i} />)}
          {latest.data?.items.map((p) => (
            <ProductCard key={p.slug} product={p} />
          ))}
        </div>
      </section>
    </>
  );
}
