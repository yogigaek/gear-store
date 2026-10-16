// Renders a studio still of every part from its own 3D model, for the catalogue cards and the cart.
// Needs the web dev server and the API running with the seeded catalogue:
//   npm run dev -w @gear-store/api  ·  npm run dev -w @gear-store/web
//   node apps/web/scripts/render-parts.mjs [base-url] [slug ...]   (no slugs: every part)
// Writes apps/web/src/assets/parts/<slug>.jpg at twice the page's pixel density, and for a part sold in
// finishes one still per finish, <slug>--<colour key>.jpg, so the cart shows the colour that was chosen.
// With no slugs given it also photographs the whole bike in each frame colour (e1-bike--<colour>.jpg),
// from the development-only /studio/bike page.
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const [base = 'http://localhost:5173', ...only] = process.argv.slice(2);
const out = fileURLToPath(new URL('../src/assets/parts/', import.meta.url));
await mkdir(out, { recursive: true });

const res = await fetch(`${base}/api/products?pageSize=48`);
if (!res.ok) throw new Error(`The API answered ${res.status}; is it running and seeded?`);
const { items } = await res.json();

// WebGL in headless Chromium runs on SwiftShader; slow, but the same renderer as a browser
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl'],
});
// reduced motion: the turntable stays still, so every still is taken from the same angle
const page = await browser.newPage({
  viewport: { width: 1280, height: 900 },
  // twice the CSS pixels, so a still stays sharp on a high-density screen
  deviceScaleFactor: 2,
  reducedMotion: 'reduce',
});
for (const { slug } of items.filter((p) => only.length === 0 || only.includes(p.slug))) {
  await page.goto(`${base}/products/${slug}?still=1`, { waitUntil: 'load' });
  const canvas = page.locator('[data-part-canvas]');
  await canvas.waitFor();
  // the hints drawn over the canvas are not part of the picture
  await page.addStyleTag({ content: '[data-overlay] { display: none !important }' });
  // the studio file, the shaders and a settled frame
  await page.waitForTimeout(6000);
  await canvas.screenshot({ path: `${out}${slug}.jpg`, type: 'jpeg', quality: 82 });
  console.log(`rendered ${slug}`);
  const detail = await (await fetch(`${base}/api/products/${slug}`)).json();
  for (const { key } of detail.colors ?? []) {
    await page.locator(`input[name="finish"][value="${key}"]`).check({ force: true });
    // the paint eases to the new colour over a few frames
    await page.waitForTimeout(2500);
    await canvas.screenshot({ path: `${out}${slug}--${key}.jpg`, type: 'jpeg', quality: 82 });
    console.log(`rendered ${slug} in ${key}`);
  }
}
if (only.length === 0 || only.includes('e1-bike')) {
  const frame = await (await fetch(`${base}/api/products/e1-frame-m`)).json();
  for (const [i, { key }] of (frame.colors ?? []).entries()) {
    await page.goto(`${base}/studio/bike?colour=${key}`, { waitUntil: 'load' });
    const canvas = page.locator('[data-part-canvas]');
    await canvas.waitFor();
    await page.waitForTimeout(7000);
    await canvas.screenshot({ path: `${out}e1-bike--${key}.jpg`, type: 'jpeg', quality: 82 });
    if (i === 0) await canvas.screenshot({ path: `${out}e1-bike.jpg`, type: 'jpeg', quality: 82 });
    console.log(`rendered the bike in ${key}`);
  }
}
await browser.close();
