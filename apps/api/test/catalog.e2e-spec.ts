import type { INestApplication } from '@nestjs/common';
import {
  buildCatalogSchema,
  buildQuoteSchema,
  categorySchema,
  MAX_LINE_QUANTITY,
  productDetailSchema,
  productPageSchema,
} from '@gear-store/shared';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { z } from 'zod';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './setup.js';

// Runs against the seeded demo catalogue (npm run db:seed).
describe('Catalogue and build (e2e)', () => {
  let app: INestApplication<App>;
  const get = (url: string) => request(app.getHttpServer()).get(url);
  const quote = (body: object) => request(app.getHttpServer()).post('/api/build/quote').send(body);

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('lists part types in build order, accessories last, with part counts', async () => {
    const categories = z.array(categorySchema).parse((await get('/api/categories').expect(200)).body);
    expect(categories.map((c) => c.slug)).toEqual([
      'frames',
      'batteries',
      'shocks',
      'forks',
      'wheelsets',
      'drivetrains',
      'cockpits',
      'seats',
      'accessories',
    ]);
    expect(categories.map((c) => c.slot)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, null]);
    expect(categories.every((c) => c.productCount > 0)).toBe(true);
  });

  it('returns a page that matches the shared contract', async () => {
    const page = productPageSchema.parse((await get('/api/products').expect(200)).body);
    expect(page).toMatchObject({ page: 1, pageSize: 12 });
    expect(page.items.every((p) => p.plate.length === 3)).toBe(true);
  });

  it('filters by part type and sorts by price', async () => {
    const res = await get('/api/products?category=batteries&sort=price-asc').expect(200);
    const items = productPageSchema.parse(res.body).items;
    expect(items.map((p) => p.slug)).toEqual(['e1-battery-625', 'e1-battery-750']);
    expect(items.every((p) => p.module === 'BATTERY')).toBe(true);
  });

  it('applies the price range on both ends', async () => {
    const res = await get('/api/products?minPrice=1000000&maxPrice=5000000&pageSize=48').expect(200);
    const items = productPageSchema.parse(res.body).items;
    expect(items.length).toBeGreaterThan(0);
    for (const p of items) {
      expect(p.price).toBeGreaterThanOrEqual(1000000);
      expect(p.price).toBeLessThanOrEqual(5000000);
    }
  });

  it('searches name and part code without regard to case', async () => {
    const page = productPageSchema.parse((await get('/api/products?q=dropper&pageSize=48').expect(200)).body);
    expect(page.items.map((p) => p.slug).sort()).toEqual(['e1-seat-150', 'e1-seat-200']);
    const byCode = productPageSchema.parse((await get('/api/products?q=bt-750').expect(200)).body);
    expect(byCode.items.map((p) => p.slug)).toEqual(['e1-battery-750']);
  });

  it('treats query text as data, not SQL', async () => {
    const res = await get(`/api/products?q=${encodeURIComponent("' OR 1=1 --")}`).expect(200);
    expect(res.body.total).toBe(0);
  });

  it('treats percent, underscore and backslash in a search as the characters themselves: found where they are, never as wildcards', async () => {
    const prisma = app.get(PrismaService);
    const marker = crypto.randomUUID().slice(0, 8);
    const { id: categoryId } = await prisma.category.findUniqueOrThrow({ where: { slug: 'accessories' } });
    const part = (kind: string, name: string) => ({
      slug: `e2e-search-${marker}-${kind}`,
      name: `${name} ${marker}`,
      model: 'S-1',
      module: 'ACCESSORY' as const,
      description: 'Created by the catalogue e2e suite',
      price: 10000,
      stock: 1,
      categoryId,
    });
    // the near miss matches every query below only if the characters were read as LIKE wildcards
    await prisma.product.createMany({
      data: [part('real', 'Wild_card 100% back\\slash'), part('near', 'Wildxcard 100x backslash')],
    });
    try {
      for (const q of ['_', '%', '\\', 'wild_card', '100%', 'back\\slash']) {
        const res = await get(`/api/products?pageSize=48&q=${encodeURIComponent(q)}`).expect(200);
        const slugs = productPageSchema.parse(res.body).items.map((p) => p.slug);
        expect([
          q,
          slugs.includes(`e2e-search-${marker}-real`),
          slugs.includes(`e2e-search-${marker}-near`),
        ]).toEqual([q, true, false]);
      }
    } finally {
      await prisma.product.deleteMany({ where: { slug: { startsWith: `e2e-search-${marker}` } } });
    }
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

  it('returns a part with all specs and its finishes', async () => {
    const product = productDetailSchema.parse((await get('/api/products/e1-frame-m').expect(200)).body);
    expect(product.module).toBe('FRAME');
    expect(product.specs.length).toBeGreaterThan(product.plate.length);
    expect(product.colors.map((c) => c.key)).toContain('signal');
  });

  it('answers 404 for an unknown part and 400 for a malformed slug', async () => {
    await get('/api/products/does-not-exist').expect(404);
    await get('/api/products/Not%20A%20Slug').expect(400);
  });

  describe('build', () => {
    const startingBuild = async () => {
      const book = buildCatalogSchema.parse((await get('/api/build').expect(200)).body);
      return { book, start: Object.fromEntries(book.slots.map((s) => [s.category, s.defaultSlug!])) };
    };

    it('offers every slot with its parts, a buildable start, and the conflicts', async () => {
      const { book, start } = await startingBuild();
      expect(book.slots).toHaveLength(8);
      expect(book.slots.every((s) => s.options.length >= 2 && s.defaultSlug !== null)).toBe(true);
      expect(book.conflicts).toContainEqual(
        expect.objectContaining({ reason: expect.stringContaining('750 Wh') }),
      );
      const priced = buildQuoteSchema.parse(
        (await quote({ parts: start, colorKey: 'signal' }).expect(200)).body,
      );
      expect(priced.problems).toEqual([]);
      const options = book.slots.flatMap((s) => s.options);
      const sum = Object.values(start).reduce(
        (t, slug) => t + options.find((o) => o.slug === slug)!.price,
        0,
      );
      expect(priced.unitPrice).toBe(sum);
      // the advertised "from" price is that starting bike, which can be bought
      expect(book.fromPrice).toBe(sum);
    });

    it('checks stock for the number of bikes asked for', async () => {
      const { start } = await startingBuild();
      const parts = { ...start, wheelsets: 'e1-wheelset-carbon' };
      const one = buildQuoteSchema.parse((await quote({ parts, colorKey: 'signal' }).expect(200)).body);
      expect(one.problems).toEqual([]);
      const four = buildQuoteSchema.parse(
        (await quote({ parts, colorKey: 'signal', quantity: 4 }).expect(200)).body,
      );
      expect(four.problems).toEqual([
        expect.objectContaining({ kind: 'OUT_OF_STOCK', slots: ['wheelsets'] }),
      ]);
      await quote({ parts, colorKey: 'signal', quantity: 11 }).expect(400);
    });

    it('explains why a build cannot be made instead of pricing it quietly', async () => {
      const { start } = await startingBuild();
      const { seats: _left, ...withoutSeat } = start;
      const res = await quote({
        parts: { ...withoutSeat, frames: 'e1-frame-s', batteries: 'e1-battery-750' },
        colorKey: 'pink',
      }).expect(200);
      const kinds = buildQuoteSchema.parse(res.body).problems.map((p) => p.kind);
      expect(kinds.sort()).toEqual(['CONFLICT', 'MISSING_PART', 'UNKNOWN_COLOR']);
    });

    it('validates the selection before looking anything up', async () => {
      await quote({ parts: { frames: 'Frame M' }, colorKey: 'signal' }).expect(400);
      await quote({ colorKey: 'signal' }).expect(400);
    });
  });

  describe('edge cases', () => {
    const issuesOf = async (url: string) =>
      ((await get(url).expect(400)).body.issues as { path: string }[]).map((i) => i.path);

    it('pages from 1 to 1000, 1 to 48 a page, and refuses anything outside', async () => {
      expect(
        productPageSchema.parse((await get('/api/products?pageSize=48').expect(200)).body).pageSize,
      ).toBe(48);
      const last = productPageSchema.parse(
        (await get('/api/products?page=1000&pageSize=1').expect(200)).body,
      );
      expect(last).toMatchObject({ items: [], page: 1000 });
      expect(await issuesOf('/api/products?pageSize=49')).toEqual(['pageSize']);
      expect(await issuesOf('/api/products?pageSize=0')).toEqual(['pageSize']);
      expect(await issuesOf('/api/products?page=0')).toEqual(['page']);
      expect(await issuesOf('/api/products?page=1001')).toEqual(['page']);
      expect(await issuesOf('/api/products?page=1.5')).toEqual(['page']);
    });

    it('searches with up to 80 characters, and refuses more or only spaces', async () => {
      await get(`/api/products?q=${'q'.repeat(80)}`).expect(200);
      expect(await issuesOf(`/api/products?q=${'q'.repeat(81)}`)).toEqual(['q']);
      expect(await issuesOf('/api/products?q=%20%20')).toEqual(['q']);
    });

    it('filters to parts in stock or sold out, and the two together make the whole catalogue', async () => {
      const page = async (query: string) =>
        productPageSchema.parse((await get(`/api/products?pageSize=48${query}`).expect(200)).body);
      const [all, inStock, soldOut] = await Promise.all([
        page(''),
        page('&inStock=true'),
        page('&inStock=false'),
      ]);
      expect(inStock.items.every((p) => p.stock > 0)).toBe(true);
      expect(soldOut.items.every((p) => p.stock === 0)).toBe(true);
      expect(inStock.total + soldOut.total).toBe(all.total);
      expect(await issuesOf('/api/products?inStock=maybe')).toEqual(['inStock']);
    });

    it('refuses a price range turned around or below zero, and answers an unknown part type with nothing', async () => {
      expect(await issuesOf('/api/products?minPrice=5000&maxPrice=1000')).toEqual(['minPrice']);
      expect(await issuesOf('/api/products?minPrice=-1')).toEqual(['minPrice']);
      await get('/api/products?minPrice=1000&maxPrice=1000').expect(200);
      const none = productPageSchema.parse(
        (await get('/api/products?category=no-such-type').expect(200)).body,
      );
      expect(none).toMatchObject({ items: [], total: 0 });
    });

    it(`quotes 1 to ${MAX_LINE_QUANTITY} bikes and refuses 0, ${MAX_LINE_QUANTITY + 1} or more than 12 slots`, async () => {
      const book = buildCatalogSchema.parse((await get('/api/build').expect(200)).body);
      const parts = Object.fromEntries(book.slots.map((s) => [s.category, s.defaultSlug!]));
      for (const quantity of [1, MAX_LINE_QUANTITY])
        await quote({ parts, colorKey: 'signal', quantity, price: 1 }).expect(200);
      for (const quantity of [0, MAX_LINE_QUANTITY + 1, 2.5])
        await quote({ parts, colorKey: 'signal', quantity }).expect(400);
      const thirteen = Object.fromEntries(Array.from({ length: 13 }, (_, i) => [`slot-${i}`, 'e1-frame-m']));
      const res = await quote({ parts: thirteen, colorKey: 'signal' }).expect(400);
      expect(res.body.issues).toEqual([{ path: 'parts', message: 'Too many slots' }]);
      await quote({ parts, colorKey: 'c'.repeat(41) }).expect(400);
    });
  });
});
