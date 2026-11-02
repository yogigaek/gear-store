import { expect, test } from '@playwright/test';

// a tab left open across a deploy asks for a page chunk under a file name the new build no longer has
test('a page whose code is gone reloads once, then explains in plain words', async ({ page }) => {
  await page.route(/\/assets\/CatalogPage-[\w-]+\.js$/, (route) =>
    route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not found' }),
  );
  let loads = 0;
  page.on('load', () => (loads += 1));

  await page.goto('/products');
  await expect.poll(() => loads).toBe(2);
  await expect(page.getByRole('heading', { name: 'This page did not load' })).toBeVisible();
  await expect(page.getByText(/The store was updated while this tab was open/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reload' })).toBeVisible();
  // the store's own header stays, and React Router's error screen (with its stack) never shows
  await expect(page.getByRole('banner')).toBeVisible();
  await expect(page.getByText(/Unexpected Application Error|dynamically imported module/)).toHaveCount(0);

  await page.getByRole('link', { name: 'Back to the store' }).click();
  await expect(page).toHaveURL('/');
  expect(loads).toBe(2);
});
