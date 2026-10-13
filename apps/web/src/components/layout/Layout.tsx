import { useEffect } from 'react';
import { Outlet, ScrollRestoration } from 'react-router';
import { CartDrawer } from '../cart/CartDrawer';
import { CartSync } from '../cart/CartSync';
import { SiteFooter } from './SiteFooter';
import { usePageTone } from './page-tone';
import { SiteHeader } from './SiteHeader';

export function Layout() {
  const tone = usePageTone();
  useEffect(() => {
    document.documentElement.dataset.tone = tone;
    // the phone's browser bar follows the page
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', tone === 'dark' ? '#0b0d0e' : '#e4e6e6');
  }, [tone]);
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-ink focus:px-4 focus:py-2 focus:text-alu-50"
      >
        Skip to content
      </a>
      <SiteHeader />
      {/* at least a screen tall: while a page's code loads, the footer waits below the fold instead of jumping */}
      <main id="main" className="min-h-[calc(100dvh-4rem)]">
        <Outlet />
      </main>
      <SiteFooter />
      <CartDrawer />
      <CartSync />
      <ScrollRestoration />
    </>
  );
}
