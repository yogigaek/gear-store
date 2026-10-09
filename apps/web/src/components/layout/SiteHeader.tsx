import { useRef } from 'react';
import { Link, NavLink, useLocation, useSearchParams } from 'react-router';
import { useAuth } from '../../lib/auth-context';
import { useCart } from '../../lib/cart';
import { cartDrawer } from '../cart/cart-drawer-store';
import { useCategories, useWishlist } from '../../lib/queries';

export function SiteHeader() {
  // native <dialog>: focus is trapped, Esc closes it, and the page behind is inert
  const menu = useRef<HTMLDialogElement>(null);
  const close = () => menu.current?.close();
  const categories = useCategories();
  const { status, user } = useAuth();
  const wishlist = useWishlist();
  const { cart } = useCart();
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const activeCategory = pathname === '/products' ? params.get('category') : null;

  const categoryLinks = (categories.data ?? []).map((c) => ({
    to: `/products?category=${c.slug}`,
    label: c.name,
    active: activeCategory === c.slug,
  }));
  const accountLabel = status === 'signed-in' ? (user?.name.split(' ')[0] ?? 'Account') : 'Sign in';
  const accountTo = status === 'signed-in' ? '/account' : '/sign-in';

  return (
    <header className="sticky top-0 z-20 border-b border-ink bg-alu">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-8 px-4 sm:px-6">
        <Link to="/" className="font-expanded text-xl font-extrabold uppercase tracking-tight">
          Rakit
        </Link>
        <nav aria-label="Categories" className="hidden gap-6 text-sm lg:flex">
          {categoryLinks.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              aria-current={l.active ? 'page' : undefined}
              className={`py-1 ${l.active ? 'border-b-2 border-ink font-semibold' : 'text-ink-2 hover:text-ink'}`}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-4 text-sm sm:gap-5">
          {status === 'signed-in' && (
            <Link
              to="/wishlist"
              className="hidden min-h-11 items-center gap-2 text-ink-2 hover:text-ink sm:flex"
            >
              Saved <span className="tabular font-mono text-xs">{wishlist.data?.length ?? 0}</span>
            </Link>
          )}
          <Link to={accountTo} className="hidden min-h-11 items-center text-ink-2 hover:text-ink sm:flex">
            {status === 'restoring' ? '…' : accountLabel}
          </Link>
          <button
            type="button"
            onClick={cartDrawer.open}
            aria-haspopup="dialog"
            className="flex min-h-11 items-center gap-2 font-semibold"
          >
            Cart{' '}
            <span className="tabular bg-ink px-1.5 font-mono text-xs text-alu-50">
              {cart?.itemCount ?? 0}
            </span>
          </button>
          <button
            type="button"
            onClick={() => menu.current?.showModal()}
            className="min-h-11 border border-ink px-3 font-mono text-xs uppercase tracking-[0.08em] lg:hidden"
            aria-haspopup="dialog"
          >
            Menu
          </button>
        </div>
      </div>

      <dialog
        ref={menu}
        aria-label="Menu"
        onClick={(e) => e.target === e.currentTarget && close()}
        className="m-0 ml-auto h-dvh max-h-none w-[min(20rem,85vw)] max-w-none border-l border-ink bg-alu p-0 text-ink backdrop:bg-ink/40"
      >
        <div className="flex h-16 items-center justify-between border-b border-ink px-4">
          <span className="font-mono text-xs uppercase tracking-[0.08em] text-ink-3">Menu</span>
          <button
            type="button"
            onClick={close}
            className="min-h-11 px-2 font-mono text-xs uppercase tracking-[0.08em]"
          >
            Close
          </button>
        </div>
        <nav aria-label="Main">
          <ul>
            {[
              { to: '/products', label: 'All products', active: pathname === '/products' && !activeCategory },
              ...categoryLinks,
            ].map((l) => (
              <li key={l.to} className="border-b border-bench">
                <Link
                  to={l.to}
                  onClick={close}
                  aria-current={l.active ? 'page' : undefined}
                  className={`flex min-h-12 items-center px-4 font-semibold ${l.active ? 'bg-alu-50 underline underline-offset-4' : ''}`}
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
          <ul className="mt-6 border-t border-ink">
            {[
              { to: accountTo, label: status === 'signed-in' ? 'Account' : 'Sign in' },
              ...(status === 'signed-in'
                ? [{ to: '/wishlist', label: `Wishlist (${wishlist.data?.length ?? 0})` }]
                : []),
              { to: '/design', label: 'Design system' },
            ].map((l) => (
              <li key={l.to} className="border-b border-bench">
                <NavLink
                  to={l.to}
                  onClick={close}
                  className={({ isActive }) =>
                    `flex min-h-12 items-center px-4 ${isActive ? 'bg-alu-50 font-semibold underline underline-offset-4' : 'text-ink-2'}`
                  }
                >
                  {l.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </dialog>
    </header>
  );
}
