import { expect, test, type Page } from '@playwright/test';
import {
  confirmedAccount,
  emailedLink,
  paymentProviderDown,
  PASSWORD,
  settlePayment,
  signIn,
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

/** puts one of a part in the cart from its page, then closes the drawer */
async function addToCart(page: Page, slug: string, name: string): Promise<void> {
  await page.goto(`/products/${slug}`);
  await page.getByRole('button', { name: 'Add to cart' }).click();
  const drawer = page.getByRole('dialog', { name: /Cart/ });
  await expect(drawer.getByText(name)).toBeVisible();
  await drawer.getByRole('button', { name: 'Close' }).click();
}

/** the first address of a new account, from the form checkout shows */
async function addAddress(page: Page): Promise<void> {
  await page.getByLabel('Recipient').fill('Rina Wijaya');
  await page.getByLabel('Mobile number').fill('0812 3456 7890');
  await page.getByLabel('Street address').fill('Jl. Riau No. 7');
  await page.getByLabel('City or regency').fill('Pekanbaru');
  await page.getByLabel('Province').selectOption('Riau');
  await page.getByLabel('Postal code').fill('28111');
  await page.getByRole('button', { name: 'Add address' }).click();
  await expect(page.getByText('Shipping to Riau')).toBeVisible();
}

/** places the order on screen; the payment page is out of reach here, so it lands on the order page */
async function placeOrder(page: Page): Promise<void> {
  await paymentProviderDown(page);
  await page.getByRole('button', { name: 'Place order and pay' }).click();
  await expect(page).toHaveURL(/\/orders\/RKT-\d{6}-[A-Z2-9]{6}\?payment=unavailable/);
}

/** the cart drawer, opened from the header, holds exactly `names` */
async function expectCart(page: Page, names: string[]): Promise<void> {
  await page.getByRole('button', { name: /^Cart \d+$/ }).click();
  const drawer = page.getByRole('dialog', { name: /Cart/ });
  for (const name of names) await expect(drawer.getByText(name, { exact: true })).toBeVisible();
  await expect(drawer.getByRole('listitem')).toHaveCount(names.length);
  await drawer.getByRole('button', { name: 'Close' }).click();
}

test('Buy now signs a guest in, orders that one part and leaves the cart as it is', async ({ page }) => {
  const email = await confirmedAccount('buy-now-guest', 'Rina Wijaya');
  await addToCart(page, 'lights-front-rear', 'Front and rear lights');
  // a sold-out part cannot be bought now either
  await page.goto('/products/folding-lock');
  await expect(page.getByRole('button', { name: 'Buy now' })).toBeDisabled();

  await page.goto('/products/workshop-hex-set');
  await page.getByRole('button', { name: 'Buy now' }).click();
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fcheckout%3Fbuy%3Dworkshop-hex-set%26qty%3D1$/);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/checkout\?buy=workshop-hex-set&qty=1$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Buy now');
  const summary = page.getByRole('region', { name: 'Order summary' });
  await expect(summary.getByRole('listitem')).toHaveCount(1);
  await expect(summary.getByText('Workshop hex key set')).toBeVisible();
  await expect(summary.getByText('AC-HX', { exact: true })).toBeVisible();
  await expect(summary.getByText(/^1 × Rp\s320\.000$/)).toBeVisible();

  await addAddress(page);
  await placeOrder(page);
  const items = page.getByRole('region', { name: 'Items' });
  await expect(items.getByRole('listitem')).toHaveCount(1);
  await expect(items.getByText('Workshop hex key set')).toBeVisible();
  await expect(items.getByText(/^1 × Rp\s320\.000$/)).toBeVisible();
  // the guest's cart joined the account on sign-in, and the order took nothing from it
  await expectCart(page, ['Front and rear lights']);
});

test('Buy now keeps the finish and quantity chosen, and the cart checkout keeps its own lines', async ({
  page,
}) => {
  const email = await confirmedAccount('buy-now-member', 'Rina Wijaya');
  await signIn(page, email);
  await addToCart(page, 'fender-set', 'Fender set');

  await page.goto('/products/e1-frame-m');
  await page
    .locator('label')
    .filter({ has: page.getByRole('radio', { name: 'Moss green' }) })
    .click();
  await expect(page.getByRole('radio', { name: 'Moss green' })).toBeChecked();
  await page.getByRole('button', { name: 'Increase quantity' }).click();
  await page.getByRole('button', { name: 'Buy now' }).click();
  await expect(page).toHaveURL(/\/checkout\?buy=e1-frame-m&finish=moss&qty=2$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Buy now');
  const summary = page.getByRole('region', { name: 'Order summary' });
  await expect(summary.getByRole('listitem')).toHaveCount(1);
  await expect(summary.getByText('E-1 Frame M')).toBeVisible();
  await expect(summary.getByText('E1-FR-M · Moss green')).toBeVisible();
  await expect(summary.getByText(/^2 × Rp\s16\.900\.000$/)).toBeVisible();
  await expect(summary.getByText('Fender set')).toHaveCount(0);

  await addAddress(page);
  await placeOrder(page);
  const items = page.getByRole('region', { name: 'Items' });
  await expect(items.getByRole('listitem')).toHaveCount(1);
  await expect(items.getByText('E1-FR-M · Moss green')).toBeVisible();
  await expect(items.getByText(/^2 × Rp\s16\.900\.000$/)).toBeVisible();
  await expectCart(page, ['Fender set']);

  // the cart's own checkout still holds what the cart holds
  await page.goto('/checkout');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Checkout');
  const cartSummary = page.getByRole('region', { name: 'Order summary' });
  await expect(cartSummary.getByRole('listitem')).toHaveCount(1);
  await expect(cartSummary.getByText('Fender set')).toBeVisible();
});

test('"Show older" stays shown after a visit to an older order, and focus moves to the rows it adds', async ({
  page,
}) => {
  // the demo shopper's own history is short: the list is stubbed with 25 orders, newest first
  const orders = Array.from({ length: 25 }, (_, i) => ({
    number: `RKT-260101-${'ABCDEFGHJKLMNPQRSTUVWXYZ2'[i]}AAAAA`,
    status: 'DELIVERED',
    total: 100000,
    itemCount: 1,
    createdAt: new Date(Date.UTC(2026, 0, 26 - i)).toISOString(),
  }));
  await page.route('**/api/me/orders', (route) => route.fulfill({ json: orders }));
  await page.goto('/sign-in');
  await page.getByRole('button', { name: /^Try as shopper/ }).click();
  await page.waitForURL('**/account');
  await page.goto('/orders');

  const rows = page.locator('main a[href^="/orders/RKT-"]');
  await expect(rows).toHaveCount(10);
  await expect(page.getByText('Showing the latest 10', { exact: true })).toBeVisible();
  const older = page.getByRole('button', { name: 'Show older' });
  await older.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/orders\?show=20$/);
  await expect(rows).toHaveCount(20);
  await expect(rows.nth(10)).toBeFocused();
  await older.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/orders\?show=30$/);
  await expect(rows).toHaveCount(25);
  await expect(older).toHaveCount(0);
  await expect(rows.nth(20)).toBeFocused();

  await rows.nth(22).click();
  await expect(page).toHaveURL(/\/orders\/RKT-260101-YAAAAA$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/orders\?show=30$/);
  await expect(rows).toHaveCount(25);
});
