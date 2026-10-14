import { expect, test } from '@playwright/test';
import { API, confirmedAccount, grantAdmin, PASSWORD, settlePayment, signIn, visitorIp } from './helpers.js';

test.use({ extraHTTPHeaders: { 'x-forwarded-for': visitorIp() } });

/** A customer with one paid order, set up through the API (the shopper spec covers doing it by hand). */
async function paidOrder() {
  const email = await confirmedAccount('buyer', 'Budi Santoso');
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-forwarded-for': visitorIp(),
  };
  const call = async (path: string, method = 'GET', body?: unknown) => {
    const init: RequestInit = { method, headers };
    if (body !== undefined) init.body = JSON.stringify(body);
    const res = await fetch(`${API}${path}`, init);
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status}`);
    return res.status === 204 ? null : res.json();
  };
  const { accessToken } = await call('/auth/login', 'POST', { email, password: PASSWORD });
  headers['authorization'] = `Bearer ${accessToken}`;
  const address = await call('/me/addresses', 'POST', {
    recipient: 'Budi Santoso',
    phone: '081298765432',
    line1: 'Jl. Malioboro No. 5',
    city: 'Yogyakarta',
    province: 'DI Yogyakarta',
    postalCode: '55271',
  });
  await call('/me/cart/items', 'PUT', { slug: 'battery-charger-4a', quantity: 1 });
  const order = await call('/me/orders', 'POST', {
    addressId: address.id,
    idempotencyKey: crypto.randomUUID(),
  });
  await settlePayment(order.number, order.total);
  return { email, number: order.number as string };
}

test('an administrator ships a paid order and the customer sees the tracking number', async ({
  page,
  browser,
}) => {
  const { email: customer, number } = await paidOrder();
  const adminEmail = await confirmedAccount('admin', 'Store Admin');
  grantAdmin(adminEmail);

  await signIn(page, adminEmail);
  await page.goto('/admin');
  await expect(page.getByText(/paid orders to ship/)).toBeVisible();
  await page.goto(`/admin/orders?status=PAID&q=${number}`);
  await page.getByRole('link', { name: number }).click();
  await page.getByLabel('Courier').selectOption('JNE');
  await page.getByLabel('Tracking number').fill('jp1234567890');
  await page.getByRole('button', { name: 'Mark shipped' }).click();
  await expect(page.getByText('Shipped with JNE. Tracking number JP1234567890.')).toBeVisible();

  const customerPage = await (
    await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': visitorIp() } })
  ).newPage();
  await signIn(customerPage, customer);
  await customerPage.goto(`/orders/${number}`);
  await expect(customerPage.getByText('JP1234567890', { exact: true })).toBeVisible();
  await expect(customerPage.getByText('Shipped', { exact: true }).first()).toBeVisible();
});

test('the demo administrator can look at everything but change nothing', async ({ page }) => {
  await page.goto('/sign-in');
  await page.getByRole('button', { name: 'Try as admin' }).click();
  await page.waitForURL('**/account');
  await page.goto('/admin/products/battery-charger-4a');
  await expect(page.getByText('Demo administrator, read-only.')).toBeVisible();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('alert')).toContainText('can look around but not change anything');
});

test('shoppers cannot open the admin area', async ({ page }) => {
  await page.goto('/sign-in');
  await page.getByRole('button', { name: 'Try as shopper' }).click();
  // wait for the sign-in to land; navigating earlier would reload the page before the session exists
  await page.waitForURL('**/account');
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Part not found' })).toBeVisible();
  await expect(page.locator('header a[href="/admin"]')).toHaveCount(0);
});
