import { MAX_LINE_QUANTITY } from '@gear-store/shared';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Button } from '../components/ui/Button';
import { Label } from '../components/ui/Label';
import { Price } from '../components/ui/Price';
import { SpecPlate } from '../components/ui/SpecPlate';
import { StockNote } from '../components/ui/StockNote';
import { ProductArt } from '../components/product/ProductArt';
import { SaveButton } from '../components/product/SaveButton';
import { ReviewsSection } from '../components/reviews/ReviewsSection';
import { Stars } from '../components/reviews/Stars';
import { cartDrawer } from '../components/cart/cart-drawer-store';
import { QuantityStepper } from '../components/cart/QuantityStepper';
import { useCart } from '../lib/cart';
import { Notice } from '../components/ui/Field';
import { ApiError } from '../lib/api';
import { useCategories, useProduct, useProductReviews } from '../lib/queries';
import { useCanRender3D, useCoarsePointer } from '../three/useCanRender3D';
import { Viewer3D } from '../three/Viewer3D';
import { NotFoundPage } from './NotFoundPage';

export function ProductPage() {
  const { slug = '' } = useParams();
  // keyed so finish, quantity and the explode slider reset when moving to another product
  return <ProductDetail key={slug} slug={slug} />;
}

function ProductDetail({ slug }: { slug: string }) {
  const query = useProduct(slug);
  const product = query.data;
  const categories = useCategories();
  const reviews = useProductReviews(slug);
  const [explode, setExplode] = useState(0);
  const [colorId, setColorId] = useState<string>();
  const [qty, setQty] = useState(1);
  const cart = useCart();
  const addToCart = useMutation({
    mutationFn: () => cart.add(slug, colorId ?? query.data?.colors[0]?.key ?? '', qty),
    onSuccess: () => {
      setQty(1);
      cartDrawer.open();
    },
  });
  const coarsePointer = useCoarsePointer();
  const can3D = useCanRender3D();
  // on touch screens the model only takes the finger while this is on, so the page keeps scrolling
  const [rotating, setRotating] = useState(false);

  if (query.error instanceof ApiError && query.error.status === 404) return <NotFoundPage />;
  if (query.isError) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <Notice tone="error">
          {query.error.message}{' '}
          <button type="button" className="font-semibold underline" onClick={() => void query.refetch()}>
            Try again
          </button>
        </Notice>
      </div>
    );
  }
  if (!product) return <ProductSkeleton />;
  const category = categories.data?.find((c) => c.slug === product.category);
  const color = product.colors.find((c) => c.key === colorId) ?? product.colors[0];
  const has3D = product.has3d && can3D;
  const interactive = has3D && (!coarsePointer || rotating);
  const soldOut = product.stock === 0;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <nav aria-label="Breadcrumb" className="mb-6 font-mono text-xs text-ink-3">
        <Link to="/" className="hover:text-ink">
          Home
        </Link>
        <span aria-hidden="true"> / </span>
        <Link to={`/products?category=${product.category}`} className="hover:text-ink">
          {category?.name ?? product.category}
        </Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page" className="text-ink">
          {product.model}
        </span>
      </nav>

      <div className="grid gap-10 lg:grid-cols-[1.25fr_1fr]">
        <section aria-label="Product view" className="min-w-0">
          <div className="bg-grid relative aspect-[4/3] border border-bench">
            {product.has3d ? (
              <Viewer3D
                category={product.category}
                explode={explode}
                shellColor={color?.hex ?? '#24292c'}
                showLabels={has3D && explode > 0.6}
                interactive={interactive}
                label={`${product.name} ${product.model}, drag to rotate`}
              />
            ) : (
              // no model for this product yet: the technical drawing stands in
              <div className="grid h-full place-items-center">
                <ProductArt category={product.category} className="w-2/5" />
              </div>
            )}
            {has3D && !coarsePointer && (
              <span className="pointer-events-none absolute left-3 top-3 font-mono text-[0.68rem] uppercase tracking-[0.08em] text-ink-3">
                Drag to rotate · scroll to zoom
              </span>
            )}
            {has3D && coarsePointer && (
              <button
                type="button"
                aria-pressed={rotating}
                onClick={() => setRotating((r) => !r)}
                className={`absolute right-2 top-2 min-h-11 border px-3 font-mono text-xs uppercase tracking-[0.08em] ${
                  rotating ? 'border-ink bg-ink text-alu-50' : 'border-ink bg-alu-50 text-ink'
                }`}
              >
                {rotating ? 'Done' : 'Rotate 3D'}
              </button>
            )}
          </div>
          {has3D && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-x border-b border-bench bg-alu-50 px-4 py-3">
              <label htmlFor="explode" className="font-mono text-xs uppercase tracking-[0.08em]">
                Assembled
              </label>
              <input
                id="explode"
                type="range"
                min={0}
                max={100}
                value={Math.round(explode * 100)}
                onChange={(e) => setExplode(Number(e.target.value) / 100)}
                aria-valuetext={
                  explode > 0.6 ? 'Exploded, parts labelled' : `${Math.round(explode * 100)}% apart`
                }
                className="min-w-0 flex-1 accent-ink"
              />
              <span aria-hidden="true" className="font-mono text-xs uppercase tracking-[0.08em]">
                Exploded
              </span>
            </div>
          )}
        </section>

        <section aria-labelledby="product-name" className="flex min-w-0 flex-col gap-6">
          <div className="space-y-2">
            <Label>
              {product.model} · {product.brand}
            </Label>
            <h1 id="product-name" className="font-expanded text-3xl font-extrabold uppercase leading-tight">
              {product.name}
            </h1>
          </div>

          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <Price amount={product.price} className="text-2xl" />
            <StockNote stock={product.stock} />
          </div>
          {reviews.data && reviews.data.count > 0 && (
            <a href="#reviews" className="flex w-fit items-center gap-2 text-sm hover:underline">
              <Stars value={reviews.data.average ?? 0} />
              <span className="tabular font-mono">{reviews.data.average?.toFixed(1)}</span>
              <span className="text-ink-3">
                · {reviews.data.count} {reviews.data.count === 1 ? 'review' : 'reviews'}
              </span>
            </a>
          )}

          <SpecPlate specs={product.plate} />

          {product.colors.length > 0 && (
            <fieldset className="space-y-2">
              <legend className="font-mono text-xs uppercase tracking-[0.08em] text-ink-3">
                Finish · <span className="text-ink">{color?.label}</span>
              </legend>
              <div className="flex gap-2">
                {product.colors.map((c) => (
                  <label key={c.key} className="cursor-pointer">
                    <input
                      type="radio"
                      name="finish"
                      value={c.key}
                      checked={c.key === color?.key}
                      onChange={() => setColorId(c.key)}
                      className="peer sr-only"
                    />
                    <span className="sr-only">{c.label}</span>
                    <span
                      aria-hidden="true"
                      className="block size-11 border border-bench p-1 peer-checked:border-2 peer-checked:border-ink peer-focus-visible:outline-3 peer-focus-visible:outline-signal"
                    >
                      <span className="block size-full" style={{ backgroundColor: c.hex }} />
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          <div className="flex flex-wrap gap-3">
            <QuantityStepper
              label="Quantity"
              value={qty}
              max={Math.max(1, Math.min(MAX_LINE_QUANTITY, product.stock))}
              disabled={soldOut}
              onChange={setQty}
            />
            <Button
              className="flex-1"
              disabled={soldOut}
              // not `disabled` while adding: a disabled button drops keyboard focus, and the cart drawer then
              // cannot hand focus back to it when it closes
              aria-disabled={addToCart.isPending || undefined}
              onClick={() => !addToCart.isPending && addToCart.mutate()}
            >
              {soldOut ? 'Out of stock' : addToCart.isPending ? 'Adding…' : 'Add to cart'}
            </Button>
            <SaveButton product={product} />
          </div>

          {addToCart.error && <Notice tone="error">{addToCart.error.message}</Notice>}

          <p className="max-w-[60ch] text-ink-2">{product.description}</p>

          {product.specs.length > 0 && (
            <div>
              <h2 className="mb-2 font-mono text-xs uppercase tracking-[0.08em] text-ink-3">
                Specifications
              </h2>
              <dl className="border-t border-ink">
                {product.specs.map((s) => (
                  <div
                    key={s.label}
                    className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4 border-b border-bench py-2 text-sm"
                  >
                    <dt className="text-ink-2">{s.label}</dt>
                    <dd className="font-mono">{s.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </section>
      </div>

      <ReviewsSection slug={product.slug} />
    </div>
  );
}

function ProductSkeleton() {
  return (
    <div aria-busy="true" className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="grid gap-10 lg:grid-cols-[1.25fr_1fr]">
        <div className="bg-grid aspect-[4/3] border border-bench" />
        <div className="space-y-4">
          <div className="h-3 w-1/4 bg-bench/60" />
          <div className="h-10 w-3/4 bg-bench/60" />
          <div className="h-6 w-1/3 bg-bench/60" />
          <div className="h-12 border border-bench" />
        </div>
      </div>
    </div>
  );
}
