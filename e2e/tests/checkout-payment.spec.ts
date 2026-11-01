import { expect, test } from '@playwright/test';
import { apiAs, confirmedAccount, paymentProviderDown, settlePayment, signIn, visitorIp } from './helpers.js';

test.use({ extraHTTPHeaders: { 'x-forwarded-for': visitorIp() } });

test('an order placed to a saved address is marked paid by the Midtrans notification', async ({ page }) => {
  const email = await confirmedAccount('checkout', 'Putu Wirawan');
  const call = await apiAs(email);
  await call('/me/addresses', 'POST', {
    label: 'Home',
    recipient: 'Putu Wirawan',
    phone: '081234567890',
    line1: 'Jl. Sudirman No. 12',
    city: 'Pekanbaru',
    province: 'Riau',
    postalCode: '28111',
    isDefault: true,
  });
  await call('/me/addresses', 'POST', {
    label: 'Office',
    recipient: 'Putu Wirawan',
    phone: '081234567890',
    line1: 'Jl. Raya Kuta No. 88',
    city: 'Badung',
    province: 'Bali',
    postalCode: '80361',
  });
  await call('/me/cart/items', 'PUT', { slug: 'battery-charger-4a', quantity: 1 });
  await call('/me/cart/items', 'PUT', { slug: 'fender-set', quantity: 2 });

  await signIn(page, email);
  await page.goto('/checkout');
  // the default address is chosen first; the other one is a click away and changes the shipping
  await expect(page.getByRole('radio', { name: /Home/ })).toBeChecked();
  await expect(page.getByText('Shipping to Riau')).toBeVisible();
  await page.getByRole('radio', { name: /Office/ }).check();
  await expect(page.getByText('Shipping to Bali')).toBeVisible();
  const summary = page.getByRole('region', { name: 'Order summary' });
  await expect(summary.getByRole('listitem')).toHaveCount(2);
  // 1 150 000 + 2 × 650 000, and Rp 22 000 to Bali
  const total = 2_450_000 + 22_000;
  await expect(summary.getByText(/^Rp\s2\.472\.000$/)).toBeVisible();

  // Midtrans is never opened: the order page offers to retry the payment page
  await paymentProviderDown(page);
  await page.getByRole('button', { name: 'Place order and pay' }).click();
  await expect(page).toHaveURL(/\/orders\/RKT-\d{6}-[A-Z2-9]{6}\?payment=unavailable$/);
  const number = page.url().match(/RKT-\d{6}-[A-Z2-9]{6}/)![0];
  const timeline = page.getByRole('region', { name: 'Timeline' });
  await expect(timeline.getByRole('listitem')).toHaveCount(1);
  await expect(timeline.getByRole('listitem')).toContainText('Waiting for payment');
  await expect(page.getByRole('button', { name: 'Pay now' })).toBeVisible();
  await expect(page.getByText('Jl. Raya Kuta No. 88')).toBeVisible();

  await settlePayment(number, total);
  await page.reload();
  await expect(timeline.getByRole('listitem')).toHaveCount(2);
  await expect(timeline.getByRole('listitem').nth(0)).toContainText('Waiting for payment');
  await expect(timeline.getByRole('listitem').nth(1)).toContainText('Paid');
  await expect(timeline.getByRole('listitem').nth(1)).toContainText('Payment received via QRIS.');
  // the status tag and the timeline both say Paid; nothing is left to pay
  await expect(page.getByText('Paid', { exact: true })).toHaveCount(2);
  await expect(page.getByText('Waiting for payment', { exact: true })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Pay now' })).toHaveCount(0);
  await expect(page.getByText('QRIS', { exact: true })).toBeVisible();

  // the order list agrees, and the cart the order was made from is empty
  await page.goto('/orders');
  await expect(page.getByRole('link', { name: new RegExp(number) })).toContainText('Paid');
  expect((await call('/me/cart')).items).toEqual([]);
});
