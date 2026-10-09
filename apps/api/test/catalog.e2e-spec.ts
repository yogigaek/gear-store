import type { INestApplication } from '@nestjs/common';
import { brandSchema, categorySchema, productDetailSchema, productPageSchema } from '@gear-store/shared';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { z } from 'zod';
import { createTestApp } from './setup.js';

// Runs against the seeded demo catalogue (npm run db:seed).
describe('Catalogue (e2e)', () => {
  let app: INestApplication<App>;
  const get = (url: string) => request(app.getHttpServer()).get(url);

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('lists categories in display order with product counts', async () => {
    const res = await get('/api/categories').expect(200);
    const categories = z.array(categorySchema).parse(res.body);
    expect(categories.map((c) => c.slug)).toEqual(['audio', 'keyboards', 'power', 'hubs']);
    expect(categories.every((c) => c.productCount > 0)).toBe(true);
  });

  it('lists brands alphabetically with counts that add up to the catalogue', async () => {
    const brands = z.array(brandSchema).parse((await get('/api/brands').expect(200)).body);
    const names = brands.map((b) => b.name);
    expect(names).toEqual([...names].sort());
    const total = productPageSchema.parse((await get('/api/products').expect(200)).body).total;
    expect(brands.reduce((sum, b) => sum + b.productCount, 0)).toBe(total);
  });

  it('returns a page that matches the shared contract', async () => {
    const res = await get('/api/products').expect(200);
    const page = productPageSchema.parse(res.body);
    expect(page).toMatchObject({ page: 1, pageSize: 12 });
    expect(page.items.every((p) => p.plate.length === 3)).toBe(true);
  });

  it('filters by category and sorts by price', async () => {
    const res = await get('/api/products?category=audio&sort=price-asc').expect(200);
    const prices = productPageSchema.parse(res.body).items.map((p) => p.price);
    expect(prices.length).toBeGreaterThan(0);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
  });

  it('applies the price range on both ends', async () => {
    const res = await get('/api/products?minPrice=300000&maxPrice=500000&pageSize=48').expect(200);
    for (const p of productPageSchema.parse(res.body).items) {
      expect(p.price).toBeGreaterThanOrEqual(300000);
      expect(p.price).toBeLessThanOrEqual(500000);
    }
  });

  it('searches name, model and brand without regard to case', async () => {
    const res = await get('/api/products?q=USB-C&pageSize=48').expect(200);
    const page = productPageSchema.parse(res.body);
    expect(page.total).toBeGreaterThan(0);
    expect(page.items.every((p) => /usb-c/i.test(`${p.name} ${p.model} ${p.brand}`))).toBe(true);
  });

  it('treats query text as data, not SQL', async () => {
    const res = await get(`/api/products?q=${encodeURIComponent("' OR 1=1 --")}`).expect(200);
    expect(res.body.total).toBe(0);
  });

  it('pages without overlap', async () => {
    const first = productPageSchema.parse((await get('/api/products?sort=name&pageSize=5').expect(200)).body);
    const second = productPageSchema.parse(
      (await get('/api/products?sort=name&pageSize=5&page=2').expect(200)).body,
    );
    const slugs = new Set(first.items.map((p) => p.slug));
    expect(second.items.some((p) => slugs.has(p.slug))).toBe(false);
  });

  it('rejects invalid queries with field-level issues', async () => {
    const res = await get('/api/products?pageSize=500&minPrice=abc').expect(400);
    expect(res.body.issues.map((i: { path: string }) => i.path).sort()).toEqual(['minPrice', 'pageSize']);
  });

  it('returns a product with all specs and finishes', async () => {
    const res = await get('/api/products/h-40-anc-headphone').expect(200);
    const product = productDetailSchema.parse(res.body);
    expect(product.specs.length).toBeGreaterThan(product.plate.length);
    expect(product.colors.length).toBeGreaterThan(0);
  });

  it('answers 404 for an unknown product and 400 for a malformed slug', async () => {
    await get('/api/products/does-not-exist').expect(404);
    await get('/api/products/Not%20A%20Slug').expect(400);
  });
});
