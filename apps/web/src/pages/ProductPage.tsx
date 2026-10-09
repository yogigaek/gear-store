import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Button } from '../components/ui/Button';
import { Label } from '../components/ui/Label';
import { Price } from '../components/ui/Price';
import { SpecPlate } from '../components/ui/SpecPlate';
import { StockNote } from '../components/ui/StockNote';
import { categories, findProduct } from '../data/catalog';
import { useCanRender3D, useCoarsePointer } from '../three/useCanRender3D';
import { Viewer3D } from '../three/Viewer3D';
import { NotFoundPage } from './NotFoundPage';

export function ProductPage() {
  const { slug = '' } = useParams();
  // keyed so finish, quantity and the explode slider reset when moving to another product
  return <ProductDetail key={slug} slug={slug} />;
}

function ProductDetail({ slug }: { slug: string }) {
  const product = findProduct(slug);
  const [explode, setExplode] = useState(0);
  const [colorId, setColorId] = useState(product?.colors[0]?.id);
  const [qty, setQty] = useState(1);
  const coarsePointer = useCoarsePointer();
  const can3D = useCanRender3D();
  // on touch screens the model only takes the finger while this is on, so the page keeps scrolling
  const [rotating, setRotating] = useState(false);

  if (!product) return <NotFoundPage />;
  const category = categories.find((c) => c.id === product.category);
  const color = product.colors.find((c) => c.id === colorId) ?? product.colors[0];
  // only the H-40 has a 3D model in the prototype
  const has3D = product.category === 'audio' && can3D;
  const interactive = has3D && (!coarsePointer || rotating);
  const soldOut = product.stock === 0;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <nav aria-label="Breadcrumb" className="mb-6 font-mono text-xs text-ink-3">
        <Link to="/" className="hover:text-ink">
          Home
        </Link>
        <span aria-hidden="true"> / </span>
        <Link to={`/c/${product.category}`} className="hover:text-ink">
          {category?.label}
        </Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page" className="text-ink">
          {product.model}
        </span>
      </nav>

      <div className="grid gap-10 lg:grid-cols-[1.25fr_1fr]">
        <section aria-label="Product view" className="min-w-0">
          <div className="bg-grid relative aspect-[4/3] border border-bench">
            <Viewer3D
              category={product.category}
              explode={has3D ? explode : 0}
              shellColor={color?.hex ?? '#24292c'}
              showLabels={has3D && explode > 0.6}
              interactive={interactive}
              label={`${product.name} ${product.model}, drag to rotate`}
            />
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
              {product.model} · {category?.label}
            </Label>
            <h1 id="product-name" className="font-expanded text-3xl font-extrabold uppercase leading-tight">
              {product.name}
            </h1>
          </div>

          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <Price amount={product.price} className="text-2xl" />
            <StockNote stock={product.stock} />
          </div>

          <SpecPlate specs={product.plate} />

          {product.colors.length > 0 && (
            <fieldset className="space-y-2">
              <legend className="font-mono text-xs uppercase tracking-[0.08em] text-ink-3">
                Finish · <span className="text-ink">{color?.label}</span>
              </legend>
              <div className="flex gap-2">
                {product.colors.map((c) => (
                  <label key={c.id} className="cursor-pointer">
                    <input
                      type="radio"
                      name="finish"
                      value={c.id}
                      checked={c.id === color?.id}
                      onChange={() => setColorId(c.id)}
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
            <div className="flex border border-ink">
              <button
                type="button"
                className="size-11 font-mono disabled:text-bench-strong"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                disabled={qty <= 1 || soldOut}
                aria-label="Decrease quantity"
              >
                −
              </button>
              <output aria-label="Quantity" className="tabular grid w-10 place-items-center font-mono">
                {qty}
              </output>
              <button
                type="button"
                className="size-11 font-mono disabled:text-bench-strong"
                onClick={() => setQty((q) => Math.min(product.stock, q + 1))}
                disabled={qty >= product.stock || soldOut}
                aria-label="Increase quantity"
              >
                +
              </button>
            </div>
            <Button className="flex-1" disabled={soldOut}>
              {soldOut ? 'Out of stock' : 'Add to cart'}
            </Button>
          </div>

          <p className="max-w-[60ch] text-ink-2">{product.summary}</p>

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
    </div>
  );
}
