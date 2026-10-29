import { MAX_LINE_QUANTITY } from '@gear-store/shared';
import { useMutation } from '@tanstack/react-query';
import { lazy, Suspense, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { Button } from '../components/ui/Button';
import { Label } from '../components/ui/Label';
import { PageTitle } from '../components/ui/PageTitle';
import { SlowServerNote } from '../components/ui/SlowServerNote';
import { Price } from '../components/ui/Price';
import { SpecPlate } from '../components/ui/SpecPlate';
import { StockNote } from '../components/ui/StockNote';
import { PartImage } from '../components/product/PartImage';
import { SaveButton } from '../components/product/SaveButton';
import { ReviewsSection } from '../components/reviews/ReviewsSection';
import { Stars } from '../components/reviews/Stars';
import { cartDrawer } from '../components/cart/cart-drawer-store';
import { QuantityStepper } from '../components/cart/QuantityStepper';
import { useCart } from '../lib/cart';
import { Notice } from '../components/ui/Field';
import { ApiError } from '../lib/api';
import { buyNowPath } from '../lib/buy-now';
import { useCategories, useProduct, useProductReviews } from '../lib/queries';
import { useCanRender3D, useCoarsePointer, usePrefersReducedMotion } from '../three/useCanRender3D';
import { NotFoundPage } from './NotFoundPage';

const PartStage = lazy(() => import('../three/parts/PartStage'));

export function ProductPage() {
  const { slug = '' } = useParams();
  // keyed so finish, quantity and the rotate toggle reset when moving to another part
  return <ProductDetail key={slug} slug={slug} />;
}

function ProductDetail({ slug }: { slug: string }) {
  // ?still=1: scripts/render-parts.mjs photographing the part for the catalogue
  const [params] = useSearchParams();
  const query = useProduct(slug);
  const product = query.data;
  const categories = useCategories();
  const reviews = useProductReviews(slug);
  const [colorId, setColorId] = useState<string>();
  const [picked, setPicked] = useState(1);
  // the stepper's top, which falls when the stock does: what was picked above it shrinks with it
  const maxQty = Math.max(1, Math.min(MAX_LINE_QUANTITY, query.data?.stock ?? MAX_LINE_QUANTITY));
  const qty = Math.min(picked, maxQty);
  const cart = useCart();
  const navigate = useNavigate();
  const addToCart = useMutation({
    mutationFn: () => cart.add(slug, colorId ?? query.data?.colors[0]?.key ?? '', qty),
    onSuccess: () => {
      setPicked(1);
      cartDrawer.open();
    },
  });
  const coarsePointer = useCoarsePointer();
  const reducedMotion = usePrefersReducedMotion();
  // on touch screens the model only takes the finger while this is on, so the page keeps scrolling
  const [rotating, setRotating] = useState(false);
  // phones show the still and load three.js (and probe WebGL) only once "Turn in 3D" is tapped
  const [opened, setOpened] = useState(false);
  const can3D = useCanRender3D(!coarsePointer || opened);

  if (query.error instanceof ApiError && query.error.status === 404)
    return <NotFoundPage title="Part not found" />;
  if (query.isError) {
    return (
      <div className="mx-auto max-w-7xl space-y-4 px-4 py-16 sm:px-6">
        <PageTitle>Part</PageTitle>
        <Notice tone="error">
          {query.error.message}{' '}
          <button
            type="button"
            className="min-h-11 font-semibold underline"
            onClick={() => void query.refetch()}
          >
            Try again
          </button>
        </Notice>
        <Link
          to="/products"
          className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4"
        >
          Back to all parts
        </Link>
      </div>
    );
  }
  if (!product) return <ProductSkeleton />;
  const category = categories.data?.find((c) => c.slug === product.category);
  const color = product.colors.find((c) => c.key === colorId) ?? product.colors[0];
  const has3D = can3D;
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
          {product.name}
        </span>
      </nav>
      <PageTitle>{product.name}</PageTitle>

      <div className="grid gap-10 lg:grid-cols-[1.25fr_1fr]">
        <section aria-label="Part view" className="min-w-0">
          <div className="relative aspect-[4/3] overflow-hidden border border-ink bg-stage">
            {/* the still first: it is there at once, and stays where WebGL is missing */}
            <PartImage
              slug={product.slug}
              colorKey={color?.key}
              module={product.module}
              className="absolute inset-0 size-full"
              eager
            />
            {has3D && (
              <div className={`absolute inset-0 ${interactive ? '' : 'pointer-events-none'}`}>
                <Suspense fallback={null}>
                  <PartStage
                    module={product.module}
                    slug={product.slug}
                    plate={product.plate}
                    name={product.name}
                    still={params.get('still') === '1'}
                    frame={color?.hex ?? '#f2c230'}
                    spin={!reducedMotion && !rotating}
                    label={`${product.name}, ${product.model}. Drag to turn it.`}
                  />
                </Suspense>
              </div>
            )}
            {has3D && !coarsePointer && (
              <span
                data-overlay
                className="pointer-events-none absolute left-3 top-3 font-mono text-[0.68rem] uppercase tracking-[0.08em] text-bench"
              >
                Drag to turn · scroll to zoom
              </span>
            )}
            {coarsePointer && (has3D || !opened) && (
              <button
                type="button"
                data-overlay
                aria-pressed={rotating}
                onClick={() => {
                  setOpened(true);
                  setRotating((r) => !r);
                }}
                className={`absolute right-2 top-2 min-h-11 border px-3 font-mono text-xs uppercase tracking-[0.08em] ${
                  rotating ? 'border-alu-50 bg-alu-50 text-ink' : 'border-alu-50 bg-ink/70 text-alu-50'
                }`}
              >
                {rotating ? 'Done' : 'Turn in 3D'}
              </button>
            )}
          </div>
          {product.module !== 'ACCESSORY' && (
            <p className="border-x border-b border-bench bg-alu-50 px-4 py-3 text-sm text-ink-2">
              One of the eight modules of the E-1.{' '}
              {/* the configurator opens with this part in its slot, and a frame in the finish chosen here */}
              <Link
                to={`/?${new URLSearchParams({
                  part: product.slug,
                  ...(product.module === 'FRAME' && color ? { colour: color.key } : {}),
                })}#configure`}
                className="font-semibold text-ink underline underline-offset-4"
              >
                Build a bike with it
              </Link>
            </p>
          )}
        </section>

        <section aria-labelledby="product-name" className="flex min-w-0 flex-col gap-6">
          <div className="space-y-2">
            <Label>{product.model}</Label>
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
                Colour · <span className="text-ink">{color?.label}</span>
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

          {/* two rows, so neither label wraps at 320 px: how many and the cart, then Buy now and save */}
          <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-3">
            <QuantityStepper
              label="Quantity"
              value={qty}
              max={maxQty}
              disabled={soldOut}
              onChange={setPicked}
            />
            <Button
              disabled={soldOut}
              // not `disabled` while adding: a disabled button drops keyboard focus, and the cart drawer then
              // cannot hand focus back to it when it closes
              aria-disabled={addToCart.isPending || undefined}
              onClick={() => !addToCart.isPending && addToCart.mutate()}
            >
              {soldOut ? 'Out of stock' : addToCart.isPending ? 'Adding…' : 'Add to cart'}
            </Button>
            <div className="col-span-2 flex gap-3">
              {/* this part alone, straight to checkout (via sign-in when signed out); the cart is not touched */}
              <Button
                variant="secondary"
                className="flex-1"
                disabled={soldOut}
                onClick={() =>
                  void navigate(buyNowPath({ slug: product.slug, colorKey: color?.key ?? '', quantity: qty }))
                }
              >
                Buy now
              </Button>
              <SaveButton product={product} />
            </div>
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
      <PageTitle>Loading part</PageTitle>
      <div className="grid gap-10 lg:grid-cols-[1.25fr_1fr]">
        <div className="bg-grid aspect-[4/3] border border-bench" />
        <div className="space-y-4">
          <div className="h-3 w-1/4 bg-bench/60" />
          <div className="h-10 w-3/4 bg-bench/60" />
          <div className="h-6 w-1/3 bg-bench/60" />
          <div className="h-12 border border-bench" />
        </div>
      </div>
      <SlowServerNote className="mt-6 text-ink-3" />
    </div>
  );
}
