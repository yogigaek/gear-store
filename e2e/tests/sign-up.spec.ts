import { expect, test } from '@playwright/test';
import { emailedLink, PASSWORD, testEmail, visitorIp } from './helpers.js';

test.use({ extraHTTPHeaders: { 'x-forwarded-for': visitorIp() } });

test('a new account is confirmed from the email, then signs in to its account page', async ({ page }) => {
  const email = testEmail('sign-up');
  await page.goto('/register');
  await page.getByLabel('Name').fill('Dewi Lestari');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Confirm password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();

  // not confirmed yet: signing in is refused with the way forward, not a wrong-password message
  await page.getByRole('link', { name: 'Back to sign in' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('Confirm your email address before signing in.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send a new link' })).toBeVisible();
  await expect(page).toHaveURL(/\/sign-in$/);

  await page.goto(await emailedLink(email, '/verify-email'));
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByText('Email confirmed. You can sign in now.')).toBeVisible();

  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Dewi Lestari');
  await expect(page.getByText(email, { exact: true })).toBeVisible();

  // the session survives a reload
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Dewi Lestari');
});
