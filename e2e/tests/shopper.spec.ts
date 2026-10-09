import { expect, test } from '@playwright/test';
import {
  emailedLink,
  paymentProviderDown,
  PASSWORD,
  settlePayment,
  testEmail,
  visitorIp,
} from './helpers.js';

test.use({ extraHTTPHeaders: { 'x-forwarded-for': visitorIp() } });

test('a guest fills a cart, signs up, pays and reviews what they bought', async ({ page }) => {
  // as a guest: the cart lives in the browser
  await page.goto('/products/kc-1-pbt-keycap-set');
  await page.getByRole('button', { name: 'Add to cart' }).click();
  const drawer = page.getByRole('dialog', { name: /Cart/ });
  await expect(drawer.getByText('PBT Keycap Set')).toBeVisible();
  await drawer.getByRole('link', { name: 'Checkout' }).click();
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fcheckout/);

  // sign up and confirm the email from the inbox
  await page.getByRole('link', { name: 'Create an account' }).click();
  const email = testEmail('shopper');
  await page.getByLabel('Name').fill('Ana Putri');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible();
  await page.goto(await emailedLink(email, '/verify-email'));
  await expect(page.getByText('Email confirmed')).toBeVisible();

  // signing in brings the guest cart along and returns to checkout
  await page.goto('/sign-in?next=%2Fcheckout');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.getByRole('region', { name: 'Order summary' }).getByText('PBT Keycap Set')).toBeVisible();

  // first address, priced by province
  await page.getByLabel('Recipient').fill('Ana Putri');
  await page.getByLabel('Mobile number').fill('0812 3456 7890');
  await page.getByLabel('Street address').fill('Jl. Sudirman No. 1');
  await page.getByLabel('City or regency').fill('Pekanbaru');
  await page.getByLabel('Province').selectOption('Riau');
  await page.getByLabel('Postal code').fill('28111');
  await page.getByRole('button', { name: 'Add address' }).click();
  await expect(page.getByText('Shipping to Riau')).toBeVisible();

  // place the order; the payment page is out of reach here, so the order page offers to retry
  await paymentProviderDown(page);
  await page.getByRole('button', { name: 'Place order and pay' }).click();
  await expect(page).toHaveURL(/\/orders\/RKT-\d{6}-[A-Z2-9]{6}\?payment=unavailable/);
  const number = page.url().match(/RKT-\d{6}-[A-Z2-9]{6}/)![0];
  await expect(page.getByText('Waiting for payment').first()).toBeVisible();
  const totalText = await page.locator('dl dd').last().textContent();
  const total = Number(totalText!.replace(/\D/g, ''));
  expect(total).toBe(349000 + 35000);

  // Midtrans confirms the payment
  await settlePayment(number, total);
  await page.reload();
  await expect(page.getByText('Payment received via QRIS.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pay now' })).toHaveCount(0);

  // a buyer may now review the product
  await page.goto('/products/kc-1-pbt-keycap-set#reviews');
  await page.getByRole('button', { name: 'Write a review' }).click();
  await page.locator('label').filter({ hasText: '5 out of 5' }).click();
  const title = `Exactly as described ${Date.now()}`;
  await page.getByLabel('Title').fill(title);
  await page
    .getByRole('textbox', { name: 'Review' })
    .fill('Thick keycaps, crisp legends, arrived in two days.');
  await page.getByRole('button', { name: 'Post review' }).click();
  await expect(page.getByText('You rated this 5 out of 5.')).toBeVisible();
  const mine = page.locator('#reviews li').filter({ hasText: title });
  await expect(mine.getByText(/Ana P. · verified purchase/)).toBeVisible();
});

test('the catalogue filters through the URL and Back undoes them', async ({ page }) => {
  await page.goto('/products');
  // phones fold the filters behind a button; wide screens show them
  const toggle = page.getByRole('button', { name: /^Filters/ });
  if (await toggle.isVisible()) await toggle.click();
  await page.getByRole('radio', { name: /Power/ }).click();
  await expect(page).toHaveURL(/category=power/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Power');
  await page.getByRole('searchbox', { name: 'Search products' }).fill('charger');
  await expect(page).toHaveURL(/q=charger/);
  await expect(page.locator('article h3')).toHaveText(['GaN Charger 65 W']);
  await page.goBack();
  await expect(page).not.toHaveURL(/q=charger/);
});
