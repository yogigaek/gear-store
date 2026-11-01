import { expect, test } from '@playwright/test';
import { confirmedAccount, signIn, visitorIp } from './helpers.js';

test.use({ extraHTTPHeaders: { 'x-forwarded-for': visitorIp() } });

test('a bike built part by part goes to the cart at the configured price', async ({ page }) => {
  const email = await confirmedAccount('configurator', 'Agus Pratama');
  await signIn(page, email);
  // the controls, not the canvas: headless Chromium may show the poster instead of the 3D bike
  await page.goto('/#configure');
  const configurator = page.getByRole('form', { name: /Build your E-1/ });
  const option = (name: string) => configurator.getByRole('radio', { name: new RegExp(`^${name}`) });

  await option('E-1 Frame L').check();
  await option('Battery 750 Wh').check();
  // the small frame is still listed, disabled, with the reason it does not fit the battery chosen
  await expect(option('E-1 Frame S')).toBeDisabled();
  await expect(option('E-1 Frame S')).toHaveAccessibleName(
    /The 750 Wh battery is longer than the S frame’s down tube\./,
  );
  await option('Air shock 150 mm').check();
  await option('Enduro fork 170 mm').check();
  await option('Carbon wheelset C30').check();
  await option('1 × 12 wireless drivetrain').check();
  await option('Carbon cockpit 800 mm').check();
  await option('Dropper 200 mm with saddle').check();
  await configurator.getByTitle('Glacier').click();
  await configurator
    .getByRole('group', { name: 'Number of bikes' })
    .getByRole('button', { name: 'Increase quantity' })
    .click();

  // 16.9 + 11.9 + 6.9 + 11.2 + 14.5 + 9.9 + 4.3 + 3.9 million rupiah, twice
  await expect(configurator.getByText(/^Rp\s159\.000\.000$/)).toBeVisible();
  await configurator.getByRole('button', { name: 'Add to cart' }).click();

  const drawer = page.getByRole('dialog', { name: /Cart/ });
  const bike = drawer.getByRole('listitem').filter({ hasText: 'Rakit E-1' });
  await expect(bike.getByText(/^Rp\s159\.000\.000$/)).toBeVisible();
  await expect(bike.getByText(/Glacier .* · 8 parts/)).toBeVisible();
  await expect(bike.getByRole('group', { name: /^Number of .* bikes$/ }).getByRole('status')).toHaveText('2');
  await bike.getByText('What it is built from').click();
  for (const part of ['E-1 Frame L', 'Battery 750 Wh', 'Enduro fork 170 mm', 'Dropper 200 mm with saddle'])
    await expect(bike.getByText(part, { exact: true })).toBeVisible();

  // in the account's cart, not only on this page
  await page.reload();
  await page.getByRole('button', { name: /^Cart \d+$/ }).click();
  await expect(drawer.getByRole('listitem').filter({ hasText: 'Rakit E-1' }).first()).toContainText(
    /Rp\s159\.000\.000/,
  );
});
