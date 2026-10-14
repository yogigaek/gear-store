// Renders a studio still of every part from its own 3D model, for the catalogue cards and the cart.
// Needs the web dev server and the API running with the seeded catalogue:
//   npm run dev -w @gear-store/api  ·  npm run dev -w @gear-store/web
//   node apps/web/scripts/render-parts.mjs [base-url]
// Writes apps/web/src/assets/parts/<slug>.jpg (800 × 600).
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const base = process.argv[2] ?? 'http://localhost:5173';
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
  deviceScaleFactor: 1,
  reducedMotion: 'reduce',
});
for (const { slug } of items) {
  await page.goto(`${base}/products/${slug}`, { waitUntil: 'load' });
  const canvas = page.locator('[data-part-canvas]');
  await canvas.waitFor();
  // the hints drawn over the canvas are not part of the picture
  await page.addStyleTag({ content: '[data-overlay] { display: none !important }' });
  // the studio file, the shaders and a settled frame
  await page.waitForTimeout(6000);
  await canvas.screenshot({ path: `${out}${slug}.jpg`, type: 'jpeg', quality: 82 });
  console.log(`rendered ${slug}`);
}
await browser.close();
