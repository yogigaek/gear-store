import { useRef } from 'react';
import { Link, NavLink, useLocation, useSearchParams } from 'react-router';
import { useAuth } from '../../lib/auth-context';
import { useCart } from '../../lib/cart';
import { cartDrawer } from '../cart/cart-drawer-store';
import { usePageTone } from './page-tone';
import { useCategories, useWishlist } from '../../lib/queries';

function prefetchSignIn() {
  void import('../../pages/account/AuthLayout');
  void import('../../pages/account/SignInPage');
  void import('../../three/bike/AuthScene');
}

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
  const dark = usePageTone() === 'dark';
  const muted = dark ? 'text-bench hover:text-alu-50' : 'text-ink-2 hover:text-ink';

  const categoryLinks = (categories.data ?? []).map((c) => ({
    to: `/products?category=${c.slug}`,
    label: c.name,
    active: activeCategory === c.slug,
  }));
  const accountLabel = status === 'signed-in' ? (user?.name.split(' ')[0] ?? 'Account') : 'Sign in';
  const accountTo = status === 'signed-in' ? '/account' : '/sign-in';

  return (
    <header
      className={`sticky top-0 z-20 border-b ${dark ? 'border-ink-2 bg-ink text-alu-50' : 'border-ink bg-alu'}`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-8 px-4 sm:px-6">
        <Link to="/" className="font-expanded text-xl font-extrabold uppercase tracking-tight">
          Rakit
        </Link>
        {/* the E-1's stage keeps the bar to two ways on; the catalogue lists every part type */}
        <nav aria-label={dark ? 'Store' : 'Categories'} className="hidden gap-6 text-sm lg:flex">
          {(dark
            ? [
                { to: '/#configure', label: 'Configure', active: false },
                { to: '/products', label: 'All parts', active: false },
              ]
            : categoryLinks
          ).map((l) => (
            <Link
              key={l.to}
              to={l.to}
              aria-current={l.active ? 'page' : undefined}
              className={`py-1 ${l.active ? 'border-b-2 border-current font-semibold' : muted}`}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-4 text-sm sm:gap-5">
          {status === 'signed-in' && (
            <Link to="/wishlist" className={`hidden min-h-11 items-center gap-2 sm:flex ${muted}`}>
              Saved <span className="tabular font-mono text-xs">{wishlist.data?.length ?? 0}</span>
            </Link>
          )}
          {user?.role === 'ADMIN' && (
            <Link
              to="/admin"
              className={`hidden min-h-11 items-center font-mono text-xs uppercase tracking-[0.08em] sm:flex ${muted}`}
            >
              Admin
            </Link>
          )}
          <Link
            to={accountTo}
            // a pointer on its way to "Sign in": start fetching the sign-in page and its 3D scene now
            onPointerEnter={status === 'signed-in' ? undefined : prefetchSignIn}
            onFocus={status === 'signed-in' ? undefined : prefetchSignIn}
            className={`hidden min-h-11 items-center sm:flex ${muted}`}
          >
            {status === 'restoring' ? '…' : accountLabel}
          </Link>
          <button
            type="button"
            onClick={cartDrawer.open}
            aria-haspopup="dialog"
            className="flex min-h-11 items-center gap-2 font-semibold"
          >
            Cart{' '}
            <span
              className={`tabular px-1.5 font-mono text-xs ${dark ? 'bg-alu-50 text-ink' : 'bg-ink text-alu-50'}`}
            >
              {cart?.itemCount ?? 0}
            </span>
          </button>
          <button
            type="button"
            onClick={() => menu.current?.showModal()}
            className={`min-h-11 border px-3 font-mono text-xs uppercase tracking-[0.08em] lg:hidden ${dark ? 'border-alu-50' : 'border-ink'}`}
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
        className={`m-0 ml-auto h-dvh max-h-none w-[min(20rem,85vw)] max-w-none border-l border-ink bg-alu p-0 text-ink backdrop:bg-black/60 ${
          dark ? 'surface-dark' : ''
        }`}
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
              { to: '/products', label: 'All parts', active: pathname === '/products' && !activeCategory },
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
              ...(user?.role === 'ADMIN' ? [{ to: '/admin', label: 'Admin' }] : []),
              ...(status === 'signed-in'
                ? [{ to: '/wishlist', label: `Wishlist (${wishlist.data?.length ?? 0})` }]
                : []),
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
