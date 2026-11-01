import { expect, test, type Locator, type Page } from '@playwright/test';
import { apiAs, confirmedAccount, signIn, visitorIp } from './helpers.js';

test.use({ extraHTTPHeaders: { 'x-forwarded-for': visitorIp() } });

/** as a guest, puts `quantity` of a part in the browser's cart from its page */
async function addAsGuest(page: Page, slug: string, name: string, quantity: number): Promise<void> {
  await page.goto(`/products/${slug}`);
  const stepper = page.getByRole('group', { name: 'Quantity', exact: true });
  for (let n = 1; n < quantity; n += 1)
    await stepper.getByRole('button', { name: 'Increase quantity' }).click();
  await expect(stepper.getByRole('status')).toHaveText(String(quantity));
  await page.getByRole('button', { name: 'Add to cart' }).click();
  const drawer = page.getByRole('dialog', { name: /Cart/ });
  await expect(drawer.getByRole('group', { name: `Quantity of ${name}` }).getByRole('status')).toHaveText(
    String(quantity),
  );
  await drawer.getByRole('button', { name: 'Close' }).click();
}

/** opens the cart drawer from the header */
async function openCart(page: Page) {
  await page.getByRole('button', { name: /^Cart \d+$/ }).click();
  return page.getByRole('dialog', { name: /Cart/ });
}

const quantityOf = (drawer: Locator, name: string) =>
  drawer.getByRole('group', { name: `Quantity of ${name}` }).getByRole('status');

test.describe('a guest cart joins the account on sign-in', () => {
  test('quantities of the same part add up and the account keeps its own parts', async ({ page }) => {
    const email = await confirmedAccount('merge', 'Sari Hidayat');
    const call = await apiAs(email);
    await call('/me/cart/items', 'PUT', { slug: 'lights-front-rear', quantity: 2 });
    await call('/me/cart/items', 'PUT', { slug: 'fender-set', quantity: 1 });

    await addAsGuest(page, 'lights-front-rear', 'Front and rear lights', 3);
    await addAsGuest(page, 'workshop-hex-set', 'Workshop hex key set', 1);
    await signIn(page, email);

    const drawer = await openCart(page);
    await expect(quantityOf(drawer, 'Front and rear lights')).toHaveText('5');
    await expect(quantityOf(drawer, 'Fender set')).toHaveText('1');
    await expect(quantityOf(drawer, 'Workshop hex key set')).toHaveText('1');
    await expect(drawer.getByRole('listitem')).toHaveCount(3);
    await expect(drawer.getByText(/did not fit in your cart/)).toHaveCount(0);

    // merged on the server and gone from the browser: a reload shows the same cart, merged once
    await page.reload();
    const again = await openCart(page);
    await expect(quantityOf(again, 'Front and rear lights')).toHaveText('5');
    await expect(again.getByRole('listitem')).toHaveCount(3);
    const saved = await call('/me/cart');
    expect(
      saved.items.map((l: { product: { slug: string }; quantity: number }) => [l.product.slug, l.quantity]),
    ).toEqual(
      expect.arrayContaining([
        ['lights-front-rear', 5],
        ['fender-set', 1],
        ['workshop-hex-set', 1],
      ]),
    );
  });

  test('parts over the limit of 10 each are named in a notice that can be dismissed', async ({ page }) => {
    const email = await confirmedAccount('merge-full', 'Sari Hidayat');
    const call = await apiAs(email);
    await call('/me/cart/items', 'PUT', { slug: 'lights-front-rear', quantity: 8 });

    await addAsGuest(page, 'lights-front-rear', 'Front and rear lights', 5);
    await signIn(page, email);

    const drawer = await openCart(page);
    await expect(quantityOf(drawer, 'Front and rear lights')).toHaveText('10');
    const notice = drawer.getByRole('status').filter({ hasText: 'did not fit' });
    await expect(notice).toHaveText(
      /3 parts from before you signed in did not fit in your cart: a cart holds up to 50 different parts, 10 of each\./,
    );
    await notice.getByRole('button', { name: 'Dismiss' }).click();
    await expect(notice).toHaveCount(0);
    await expect(quantityOf(drawer, 'Front and rear lights')).toHaveText('10');
  });
});
