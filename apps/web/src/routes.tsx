import type { ComponentType } from 'react';
import type { RouteObject } from 'react-router';
import { Layout } from './components/layout/Layout';
import { RequireAuth } from './components/layout/RequireAuth';
import { HomePage } from './pages/HomePage';
import { NotFoundPage } from './pages/NotFoundPage';

/**
 * Every page but the home page is its own chunk, loaded when it is first visited. The landing page stays in
 * the main bundle so a first visit paints without a second round trip.
 */
function page(load: () => Promise<ComponentType>, { signedIn = false } = {}): Pick<RouteObject, 'lazy'> {
  return {
    lazy: async () => {
      const Page = await load();
      return {
        Component: signedIn
          ? () => (
              <RequireAuth>
                <Page />
              </RequireAuth>
            )
          : Page,
      };
    },
  };
}

const auth = { signedIn: true };

export const routes: RouteObject[] = [
  {
    element: <Layout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'products', ...page(async () => (await import('./pages/CatalogPage')).CatalogPage) },
      { path: 'products/:slug', ...page(async () => (await import('./pages/ProductPage')).ProductPage) },
      { path: 'c/:id', ...page(async () => (await import('./pages/CategoryRedirect')).CategoryRedirect) },
      { path: 'sign-in', ...page(async () => (await import('./pages/account/SignInPage')).SignInPage) },
      { path: 'register', ...page(async () => (await import('./pages/account/RegisterPage')).RegisterPage) },
      {
        path: 'verify-email',
        ...page(async () => (await import('./pages/account/VerifyEmailPage')).VerifyEmailPage),
      },
      {
        path: 'forgot-password',
        ...page(async () => (await import('./pages/account/ForgotPasswordPage')).ForgotPasswordPage),
      },
      {
        path: 'reset-password',
        ...page(async () => (await import('./pages/account/ResetPasswordPage')).ResetPasswordPage),
      },
      {
        path: 'account',
        ...page(async () => (await import('./pages/account/AccountPage')).AccountPage, auth),
      },
      {
        path: 'account/addresses',
        ...page(async () => (await import('./pages/account/AddressesPage')).AddressesPage, auth),
      },
      { path: 'wishlist', ...page(async () => (await import('./pages/WishlistPage')).WishlistPage, auth) },
      {
        path: 'checkout',
        ...page(async () => (await import('./pages/orders/CheckoutPage')).CheckoutPage, auth),
      },
      { path: 'orders', ...page(async () => (await import('./pages/orders/OrdersPage')).OrdersPage, auth) },
      {
        path: 'orders/:number',
        ...page(async () => (await import('./pages/orders/OrderPage')).OrderPage, auth),
      },
      {
        path: 'admin',
        // AdminGate checks the role itself and shows the admin layout
        ...page(async () => (await import('./pages/admin/AdminRoutes')).default),
        children: [
          { index: true, ...page(async () => (await import('./pages/admin/OverviewPage')).OverviewPage) },
          {
            path: 'orders',
            ...page(async () => (await import('./pages/admin/OrdersAdminPage')).OrdersAdminPage),
          },
          {
            path: 'orders/:number',
            ...page(async () => (await import('./pages/admin/OrderAdminPage')).OrderAdminPage),
          },
          {
            path: 'products',
            ...page(async () => (await import('./pages/admin/ProductsAdminPage')).ProductsAdminPage),
          },
          {
            path: 'products/new',
            ...page(async () => (await import('./pages/admin/ProductEditPage')).ProductEditPage),
          },
          {
            path: 'products/:slug',
            ...page(async () => (await import('./pages/admin/ProductEditPage')).ProductEditPage),
          },
          {
            path: 'categories',
            ...page(async () => (await import('./pages/admin/CategoriesAdminPage')).CategoriesAdminPage),
          },
          {
            path: 'customers',
            ...page(async () => (await import('./pages/admin/CustomersAdminPage')).CustomersAdminPage),
          },
        ],
      },
      { path: 'design', ...page(async () => (await import('./pages/DesignSystemPage')).DesignSystemPage) },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
