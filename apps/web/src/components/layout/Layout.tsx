import { Outlet, ScrollRestoration } from 'react-router';
import { CartDrawer } from '../cart/CartDrawer';
import { CartSync } from '../cart/CartSync';
import { SiteFooter } from './SiteFooter';
import { SiteHeader } from './SiteHeader';

export function Layout() {
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-ink focus:px-4 focus:py-2 focus:text-alu-50"
      >
        Skip to content
      </a>
      <SiteHeader />
      <main id="main">
        <Outlet />
      </main>
      <SiteFooter />
      <CartDrawer />
      <CartSync />
      <ScrollRestoration />
    </>
  );
}
