import { Link } from 'react-router';
import { ProductCard, ProductCardSkeleton } from '../components/product/ProductCard';
import { Notice } from '../components/ui/Field';
import { AccountCrumb } from '../components/layout/AccountCrumb';
import { Label } from '../components/ui/Label';
import { PageTitle } from '../components/ui/PageTitle';
import { useWishlist } from '../lib/queries';

export function WishlistPage() {
  const wishlist = useWishlist();
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <PageTitle>Wishlist</PageTitle>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-ink pb-4">
        <div className="space-y-1">
          <AccountCrumb page="Wishlist" />
          <h1 className="font-expanded text-4xl font-extrabold uppercase">Wishlist</h1>
        </div>
        {wishlist.data && <Label>{wishlist.data.length} saved</Label>}
      </div>
      {wishlist.isError && <Notice tone="error">{wishlist.error.message}</Notice>}
      {wishlist.data?.length === 0 && (
        <div className="max-w-md space-y-3">
          <p className="text-ink-2">Nothing saved yet. Use the bookmark on any product to keep it here.</p>
          <Link to="/products" className="font-semibold underline underline-offset-4">
            Browse the catalogue
          </Link>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {wishlist.isPending && Array.from({ length: 4 }, (_, i) => <ProductCardSkeleton key={i} />)}
        {wishlist.data?.map((p) => (
          <ProductCard key={p.slug} product={p} />
        ))}
      </div>
    </div>
  );
}
