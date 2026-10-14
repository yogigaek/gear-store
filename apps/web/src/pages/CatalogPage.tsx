import { productSorts, type ProductQuery } from '@gear-store/shared';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { ProductCard, ProductCardSkeleton } from '../components/product/ProductCard';
import { Button } from '../components/ui/Button';
import { Notice } from '../components/ui/Field';
import { Label } from '../components/ui/Label';
import { readCatalogQuery, writeCatalogQuery } from '../lib/catalog-query';
import { useCategories, useProducts } from '../lib/queries';

const sortLabels: Record<(typeof productSorts)[number], string> = {
  newest: 'Newest',
  'price-asc': 'Price: low to high',
  'price-desc': 'Price: high to low',
  name: 'Name',
};

const controlClass =
  'min-h-11 w-full border border-bench-strong bg-alu-50 px-3 text-base text-ink sm:text-sm';

export function CatalogPage() {
  const [params, setParams] = useSearchParams();
  const query = readCatalogQuery(params);
  const products = useProducts(query);
  const categories = useCategories();

  // any filter change starts again from page 1
  const update = (patch: Partial<ProductQuery>) =>
    setParams(writeCatalogQuery({ ...query, page: 1, ...patch }), { preventScrollReset: true });

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [search, setSearch] = useState(query.q ?? '');
  useEffect(() => setSearch(query.q ?? ''), [query.q]);
  // search as you type, after a short pause, so each keystroke is not a request
  useEffect(() => {
    const value = search.trim();
    if (value === (query.q ?? '')) return;
    const t = setTimeout(() => update({ q: value || undefined }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the typed text should restart the timer
  }, [search]);

  const category = categories.data?.find((c) => c.slug === query.category);
  const page = products.data;
  const pages = page ? Math.max(1, Math.ceil(page.total / page.pageSize)) : 1;
  const activeFilters = [query.q, query.category, query.minPrice, query.maxPrice, query.inStock].filter(
    (v) => v !== undefined,
  ).length;

  const filters = (
    <div className="space-y-6">
      <fieldset className="space-y-2">
        <legend className="mb-2 font-mono text-xs uppercase tracking-[0.08em] text-ink-3">Part type</legend>
        {[{ slug: undefined, name: 'All', productCount: undefined }, ...(categories.data ?? [])].map((c) => (
          <label key={c.slug ?? 'all'} className="flex min-h-9 cursor-pointer items-center gap-2 text-sm">
            <input
              type="radio"
              name="category"
              checked={query.category === c.slug}
              onChange={() => update({ category: c.slug })}
              className="size-4 accent-ink"
            />
            <span className="flex-1">{c.name}</span>
            {c.productCount !== undefined && (
              <span className="tabular font-mono text-xs text-ink-3">{c.productCount}</span>
            )}
          </label>
        ))}
      </fieldset>

      <PriceRange
        key={`${query.minPrice}-${query.maxPrice}`}
        min={query.minPrice}
        max={query.maxPrice}
        onApply={(minPrice, maxPrice) => update({ minPrice, maxPrice })}
      />

      <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={query.inStock === true}
          onChange={(e) => update({ inStock: e.target.checked ? true : undefined })}
          className="size-4 accent-ink"
        />
        In stock only
      </label>

      {activeFilters > 0 && (
        <Button
          variant="ghost"
          className="px-0"
          onClick={() => setParams(writeCatalogQuery({ sort: query.sort }))}
        >
          Clear filters
        </Button>
      )}
    </div>
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-ink pb-4">
        <div className="space-y-1">
          <Label>{category?.description ?? 'Every module of the E-1, and the accessories'}</Label>
          <h1 className="font-expanded text-4xl font-extrabold uppercase">{category?.name ?? 'All parts'}</h1>
        </div>
        <p className="font-mono text-xs uppercase tracking-[0.08em] text-ink-3" aria-live="polite">
          {page ? `${page.total} ${page.total === 1 ? 'part' : 'parts'}` : ' '}
        </p>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-[minmax(0,1fr)_14rem]">
        <div>
          <label htmlFor="search" className="sr-only">
            Search parts
          </label>
          <input
            id="search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or part code"
            className={controlClass}
          />
        </div>
        <div>
          <label htmlFor="sort" className="sr-only">
            Sort by
          </label>
          <select
            id="sort"
            value={query.sort}
            onChange={(e) => update({ sort: e.target.value as ProductQuery['sort'] })}
            className={controlClass}
          >
            {productSorts.map((s) => (
              <option key={s} value={s}>
                {sortLabels[s]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[14rem_minmax(0,1fr)]">
        {/* one filter panel (ids stay unique); on small screens a button folds it away */}
        <div>
          <button
            type="button"
            aria-expanded={filtersOpen}
            aria-controls="filters"
            onClick={() => setFiltersOpen((o) => !o)}
            className="flex min-h-11 w-full items-center justify-between border border-bench bg-alu-50 px-4 font-mono text-xs uppercase tracking-[0.08em] lg:hidden"
          >
            Filters{activeFilters > 0 && ` · ${activeFilters} on`}
            <span aria-hidden="true">{filtersOpen ? '−' : '+'}</span>
          </button>
          <aside
            id="filters"
            aria-label="Filters"
            className={`${filtersOpen ? 'block' : 'hidden'} border-x border-b border-bench bg-alu-50 p-4 lg:block lg:border-0 lg:bg-transparent lg:p-0`}
          >
            {filters}
          </aside>
        </div>

        <section aria-labelledby="results-title" className="min-w-0 space-y-6">
          <h2 id="results-title" className="sr-only">
            Parts
          </h2>
          {products.isError && (
            <Notice tone="error">
              {products.error.message}{' '}
              <button
                type="button"
                className="font-semibold underline"
                onClick={() => void products.refetch()}
              >
                Try again
              </button>
            </Notice>
          )}
          {page?.items.length === 0 && (
            <div className="space-y-2 border border-bench bg-alu-50 p-6">
              <p className="font-semibold">No parts match these filters.</p>
              <p className="text-sm text-ink-2">Try a shorter search or remove a filter.</p>
            </div>
          )}
          <div
            className={`grid gap-4 sm:grid-cols-2 xl:grid-cols-3 ${products.isPlaceholderData ? 'opacity-60' : ''}`}
            aria-busy={products.isFetching}
          >
            {products.isPending && Array.from({ length: 6 }, (_, i) => <ProductCardSkeleton key={i} />)}
            {page?.items.map((p) => (
              <ProductCard key={p.slug} product={p} />
            ))}
          </div>
          {page && pages > 1 && (
            <nav
              aria-label="Pages"
              className="flex items-center justify-between gap-4 border-t border-ink pt-4"
            >
              <Button
                variant="secondary"
                disabled={query.page <= 1}
                onClick={() => update({ page: query.page - 1 })}
              >
                Previous
              </Button>
              <span className="tabular font-mono text-sm">
                Page {query.page} of {pages}
              </span>
              <Button
                variant="secondary"
                disabled={query.page >= pages}
                onClick={() => update({ page: query.page + 1 })}
              >
                Next
              </Button>
            </nav>
          )}
        </section>
      </div>
    </div>
  );
}

function PriceRange({
  min,
  max,
  onApply,
}: {
  min?: number;
  max?: number;
  onApply: (min?: number, max?: number) => void;
}) {
  const [from, setFrom] = useState(min?.toString() ?? '');
  const [to, setTo] = useState(max?.toString() ?? '');
  const toNumber = (v: string) =>
    v.trim() === '' ? undefined : Math.max(0, Math.floor(Number(v.replace(/\D/g, ''))));
  const apply = () => {
    let a = toNumber(from);
    let b = toNumber(to);
    if (a !== undefined && b !== undefined && a > b) [a, b] = [b, a];
    // leaving the field unchanged must not reset the page
    if (a !== min || b !== max) onApply(a, b);
  };
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        apply();
      }}
    >
      <fieldset>
        <legend className="mb-2 font-mono text-xs uppercase tracking-[0.08em] text-ink-3">Price (Rp)</legend>
        <div className="grid grid-cols-2 gap-2">
          <label className="sr-only" htmlFor="price-min">
            Minimum price
          </label>
          <input
            id="price-min"
            inputMode="numeric"
            placeholder="Min"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            onBlur={apply}
            className={`${controlClass} tabular font-mono`}
          />
          <label className="sr-only" htmlFor="price-max">
            Maximum price
          </label>
          <input
            id="price-max"
            inputMode="numeric"
            placeholder="Max"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            onBlur={apply}
            className={`${controlClass} tabular font-mono`}
          />
        </div>
      </fieldset>
    </form>
  );
}
