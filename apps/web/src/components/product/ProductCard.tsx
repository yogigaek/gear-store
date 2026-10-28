import type { ProductSummary } from '@gear-store/shared';
import { Link } from 'react-router';
import { Label } from '../ui/Label';
import { Price } from '../ui/Price';
import { SpecPlate } from '../ui/SpecPlate';
import { StockNote } from '../ui/StockNote';
import { PartImage } from './PartImage';
import { SaveButton } from './SaveButton';

// phones: the still and the name side by side, the spec plate and price across the card below them, so the
// plate keeps the card's full width. Below 360 px the card stacks.
const cardBox =
  'flex flex-col border border-bench bg-alu-50 min-[360px]:grid min-[360px]:grid-cols-[7rem_minmax(0,1fr)] sm:flex sm:flex-col';
const card = `group relative transition-colors hover:border-ink ${cardBox}`;
const artFrame =
  'h-28 overflow-hidden border-b border-bench min-[360px]:aspect-square min-[360px]:h-auto min-[360px]:border-r sm:aspect-[4/3] sm:border-r-0';

export function ProductCard({ product }: { product: ProductSummary }) {
  return (
    <article className={card}>
      <div className={artFrame}>
        <PartImage
          slug={product.slug}
          module={product.module}
          className="size-full transition-transform duration-500 group-hover:scale-[1.04]"
        />
      </div>
      <div className="flex min-w-0 flex-col gap-2 p-3 min-[360px]:justify-center min-[360px]:border-b min-[360px]:border-bench sm:gap-3 sm:border-b-0 sm:p-4 sm:pb-0">
        <div className="flex items-baseline justify-between gap-3">
          <Label>{product.model}</Label>
          <StockNote stock={product.stock} />
        </div>
        <h3 className="font-semibold leading-snug">
          {/* the whole card is the link target; the heading carries the accessible name */}
          <Link
            to={`/products/${product.slug}`}
            // the focus ring goes round the whole card, on the overlay that makes it one link
            className="after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:outline-3 focus-visible:after:outline-offset-2 focus-visible:after:outline-signal"
          >
            {product.name}
          </Link>
        </h3>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-3 pt-0 min-[360px]:col-span-2 min-[360px]:pt-3 sm:p-4 sm:pt-3">
        <SpecPlate specs={product.plate} />
        <div className="mt-auto flex items-center justify-between gap-3 pt-1">
          <Price amount={product.price} />
          {/* above the card-wide link so it gets its own clicks */}
          <SaveButton product={product} className="relative z-10" />
        </div>
      </div>
    </article>
  );
}

export function ProductCardSkeleton() {
  return (
    <div aria-hidden="true" className={cardBox}>
      <div className={`bg-grid ${artFrame}`} />
      <div className="flex min-w-0 flex-col gap-2 p-3 min-[360px]:justify-center min-[360px]:border-b min-[360px]:border-bench sm:gap-3 sm:border-b-0 sm:p-4 sm:pb-0">
        <div className="h-3 w-1/3 bg-bench/60" />
        <div className="h-4 w-3/4 bg-bench/60" />
      </div>
      <div className="flex flex-1 flex-col gap-3 p-3 pt-0 min-[360px]:col-span-2 min-[360px]:pt-3 sm:p-4 sm:pt-3">
        <div className="h-12 border border-bench" />
        <div className="h-5 w-1/3 bg-bench/60" />
      </div>
    </div>
  );
}
