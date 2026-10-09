import { Link } from 'react-router';
import type { Product } from '../../data/catalog';
import { Label } from '../ui/Label';
import { Price } from '../ui/Price';
import { SpecPlate } from '../ui/SpecPlate';
import { StockNote } from '../ui/StockNote';
import { ProductArt } from './ProductArt';

export function ProductCard({ product }: { product: Product }) {
  return (
    // phones: drawing on the left, details on the right, so four products fit in two screens, not four
    <article className="group relative grid grid-cols-[6.5rem_minmax(0,1fr)] border border-bench bg-alu-50 transition-colors hover:border-ink sm:flex sm:flex-col">
      <div className="bg-grid grid place-items-center border-r border-bench sm:aspect-[4/3] sm:border-b sm:border-r-0">
        <ProductArt category={product.category} className="w-4/5 sm:w-2/5" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-3 p-3 sm:p-4">
        <div className="flex items-baseline justify-between gap-3">
          <Label>{product.model}</Label>
          <StockNote stock={product.stock} />
        </div>
        <h3 className="font-semibold leading-snug">
          {/* the whole card is the link target; the heading carries the accessible name */}
          <Link
            to={`/products/${product.slug}`}
            className="after:absolute after:inset-0 focus-visible:outline-none"
          >
            {product.name}
          </Link>
        </h3>
        <SpecPlate specs={product.plate} />
        <Price amount={product.price} className="mt-auto pt-1" />
      </div>
    </article>
  );
}
