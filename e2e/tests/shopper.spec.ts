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

test('a guest builds an E-1, signs up, pays and reviews a part of it', async ({ page }) => {
  // as a guest: the configurator offers only what can be built, and the cart lives in the browser
  await page.goto('/#configure');
  const configurator = page.getByRole('form', { name: /Build your E-1/ });
  await configurator.getByRole('radio', { name: /E-1 Frame S/ }).check();
  // the long battery does not fit the small frame: offered, but disabled with the reason
  await expect(configurator.getByRole('radio', { name: /Battery 750 Wh/ })).toBeDisabled();
  await expect(configurator.getByText('longer than the S frame’s down tube')).toBeVisible();
  // the swatch is the label around a visually hidden radio: click it as a person would
  await configurator.getByTitle('Moss green').click();
  await expect(configurator.getByRole('radio', { name: 'Moss green' })).toBeChecked();
  await configurator.getByRole('button', { name: 'Add to cart' }).click();
  const drawer = page.getByRole('dialog', { name: /Cart/ });
  await expect(drawer.getByText('Rakit E-1')).toBeVisible();
  await expect(drawer.getByText(/Moss green · 8 parts/)).toBeVisible();
  await drawer.getByRole('link', { name: 'Checkout' }).click();
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fcheckout/);

  // sign up and confirm the email from the inbox
  await page.getByRole('link', { name: 'Create an account' }).click();
  const email = testEmail('shopper');
  await page.getByLabel('Name').fill('Ana Putri');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  // a confirmation that does not match is caught before anything is sent
  await page.getByLabel('Confirm password').fill(`${PASSWORD}x`);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('The passwords do not match')).toBeVisible();
  await page.getByLabel('Confirm password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible();
  await page.goto(await emailedLink(email, '/verify-email'));
  // confirmed: straight to the sign-in form with the news, and the used link is gone from the history
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByText('Email confirmed')).toBeVisible();
  await expect(page.getByText('This link is incomplete')).toHaveCount(0);

  // signing in brings the guest cart along and returns to checkout
  await page.goto('/sign-in?next=%2Fcheckout');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/checkout$/);
  // signed in, the sign-in form is never shown again (Back or a bookmark): it sends the visitor on
  await page.goto('/sign-in?next=%2Fcheckout');
  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.getByRole('region', { name: 'Order summary' }).getByText('Rakit E-1')).toBeVisible();

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
  // the sandbox is explained right where the buyer pays: the test card and the simulator for transfers
  await expect(page.getByText('4811 1111 1111 1114')).toBeVisible();
  await expect(page.getByRole('link', { name: /Midtrans sandbox simulator/ })).toHaveAttribute(
    'href',
    'https://simulator.sandbox.midtrans.com',
  );
  const totalText = await page.locator('dl dd').last().textContent();
  const total = Number(totalText!.replace(/\D/g, ''));
  // the cheapest part in every slot but the frame, which is any size at one price
  expect(total).toBe(61_500_000 + 35000);
  await expect(page.getByText('E-1 Frame S')).toBeVisible();

  // Midtrans confirms the payment
  await settlePayment(number, total);
  await page.reload();
  await expect(page.getByText('Payment received via QRIS.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pay now' })).toHaveCount(0);

  // the parts of a paid bike count as bought: the buyer may review the frame
  await page.goto('/products/e1-frame-s#reviews');
  await page.getByRole('button', { name: 'Write a review' }).click();
  await page.locator('label').filter({ hasText: '5 out of 5' }).click();
  const title = `Exactly as described ${Date.now()}`;
  await page.getByLabel('Title').fill(title);
  await page
    .getByRole('textbox', { name: 'Review' })
    .fill('Stiff, quiet, and the battery drops out with one key.');
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
  await page.getByRole('radio', { name: /Accessories/ }).click();
  await expect(page).toHaveURL(/category=accessories/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Accessories');
  await page.getByRole('searchbox', { name: 'Search parts' }).fill('charger');
  await expect(page).toHaveURL(/q=charger/);
  await expect(page.locator('article h3')).toHaveText(['Fast charger 4 A']);
  await page.goBack();
  await expect(page).not.toHaveURL(/q=charger/);
});
