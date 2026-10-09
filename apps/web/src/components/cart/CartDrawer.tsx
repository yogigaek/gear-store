import type { CartLine } from '@gear-store/shared';
import { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router';
import { useAuth } from '../../lib/auth-context';
import { useCart } from '../../lib/cart';
import { ProductArt } from '../product/ProductArt';
import { Notice } from '../ui/Field';
import { Price } from '../ui/Price';
import { cartDrawer, useCartDrawerOpen } from './cart-drawer-store';
import { QuantityStepper } from './QuantityStepper';

const problemText: Record<NonNullable<CartLine['problem']>, (line: CartLine) => string> = {
  OUT_OF_STOCK: () => 'Out of stock. Remove it to check out.',
  NOT_ENOUGH_STOCK: (line) => `Only ${line.product.stock} left. Lower the quantity to check out.`,
};

export function CartDrawer() {
  const open = useCartDrawerOpen();
  const dialog = useRef<HTMLDialogElement>(null);
  const { cart, isLoading, isUpdating, error, setQuantity } = useCart();
  const { status } = useAuth();
  const { pathname } = useLocation();

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  // following a link inside the drawer closes it
  useEffect(() => cartDrawer.close(), [pathname]);

  const checkoutTo = status === 'signed-in' ? '/checkout' : '/sign-in?next=%2Fcheckout';

  return (
    <dialog
      ref={dialog}
      aria-labelledby="cart-title"
      onClose={cartDrawer.close}
      onClick={(e) => e.target === e.currentTarget && cartDrawer.close()}
      className="m-0 ml-auto h-dvh max-h-none w-[min(26rem,100vw)] max-w-none border-l border-ink bg-alu p-0 text-ink backdrop:bg-ink/40"
    >
      <div className="flex h-full flex-col">
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-ink px-4">
          <h2 id="cart-title" className="font-expanded text-lg font-extrabold uppercase">
            Cart
            {cart?.itemCount ? (
              <span className="tabular ml-2 font-mono text-sm">{cart.itemCount}</span>
            ) : null}
          </h2>
          <button
            type="button"
            onClick={cartDrawer.close}
            className="min-h-11 px-2 font-mono text-xs uppercase tracking-[0.08em]"
          >
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto" aria-busy={isUpdating}>
          {error && (
            <div className="p-4">
              <Notice tone="error">{error.message}</Notice>
            </div>
          )}
          {isLoading && <p className="p-4 font-mono text-sm text-ink-3">Loading cart…</p>}
          {!isLoading && cart?.items.length === 0 && (
            <div className="space-y-3 p-4">
              <p className="text-ink-2">Your cart is empty.</p>
              <Link to="/products" className="font-semibold underline underline-offset-4">
                Browse the catalogue
              </Link>
            </div>
          )}
          <ul>
            {cart?.items.map((line) => (
              <li
                key={`${line.product.slug}:${line.colorKey}`}
                className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3 border-b border-bench p-4"
              >
                <div className="bg-grid grid aspect-square place-items-center border border-bench">
                  <ProductArt category={line.product.category} className="w-4/5" />
                </div>
                <div className="min-w-0 space-y-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <Link
                      to={`/products/${line.product.slug}`}
                      className="font-semibold leading-snug hover:underline"
                    >
                      {line.product.name}
                    </Link>
                    <Price amount={line.lineTotal} className="shrink-0 text-sm" />
                  </div>
                  <p className="font-mono text-xs text-ink-3">
                    {line.product.model}
                    {line.colorLabel && ` · ${line.colorLabel}`}
                  </p>
                  {line.problem && <p className="text-sm text-danger">{problemText[line.problem](line)}</p>}
                  <div className="flex items-center justify-between gap-2">
                    <QuantityStepper
                      label={`Quantity of ${line.product.name}`}
                      value={line.quantity}
                      disabled={isUpdating}
                      onChange={(q) => void setQuantity(line.product.slug, line.colorKey, q)}
                    />
                    <button
                      type="button"
                      className="min-h-11 text-sm underline underline-offset-4"
                      onClick={() => void setQuantity(line.product.slug, line.colorKey, 0)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {cart && cart.items.length > 0 && (
          <div className="shrink-0 space-y-3 border-t border-ink p-4">
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-xs uppercase tracking-[0.08em]">Subtotal</span>
              <Price amount={cart.subtotal} className="text-lg" />
            </div>
            <p className="text-sm text-ink-3">Shipping is added at checkout, by province.</p>
            {cart.canCheckout ? (
              <Link
                to={checkoutTo}
                className="flex min-h-11 items-center justify-center border-b-[3px] border-signal bg-ink px-5 text-sm font-semibold uppercase tracking-[0.06em] text-alu-50 hover:bg-ink-2"
              >
                Checkout
              </Link>
            ) : (
              <p className="border border-danger px-4 py-3 text-sm text-danger">
                Fix the items marked above to check out.
              </p>
            )}
          </div>
        )}
      </div>
    </dialog>
  );
}
