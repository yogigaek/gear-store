import type { INestApplication } from '@nestjs/common';
import { MAX_CART_LINES, buildCatalogSchema, cartSchema, mergeCartResultSchema } from '@gear-store/shared';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, FakeMail, nextIp, signedInCustomer, deleteTestUsers } from './setup.js';

// enough parts of our own to fill a cart, plus one taken off sale
const TEMP_PREFIX = `e2e-cart-${Date.now()}`;
const tempSlug = (i: number) => `${TEMP_PREFIX}-${i}`;
const WITHDRAWN = `${TEMP_PREFIX}-withdrawn`;

describe('Cart (e2e)', () => {
  let app: INestApplication<App>;
  const mail = new FakeMail();
  let start: Record<string, string>;
  let prisma: PrismaService;

  const quote = (items: object[], builds: object[] = []) =>
    request(app.getHttpServer())
      .post('/api/cart/quote')
      .set('X-Forwarded-For', nextIp())
      .send({ items, builds });
  const as = (token: string) => {
    const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
    const server = () => request(app.getHttpServer());
    return {
      get: () => auth(server().get('/api/me/cart')),
      set: (line: object) => auth(server().put('/api/me/cart/items')).send(line),
      addBuild: (build: object) => auth(server().post('/api/me/cart/builds')).send(build),
      setBuild: (id: string, quantity: number) =>
        auth(server().put(`/api/me/cart/builds/${id}`)).send({ quantity }),
      merge: (items: object[], builds: object[] = [], mergeKey?: string) =>
        auth(server().post('/api/me/cart/merge')).send({ items, builds, mergeKey }),
    };
  };

  /** the signed-in account's id, from its access token */
  const userIdOf = (token: string) =>
    (JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString()) as { sub: string }).sub;

  /** puts lines straight into an account's cart, past what the API would allow one by one */
  async function fillCart(token: string, slugs: string[], quantity = 1) {
    const products = await prisma.product.findMany({ where: { slug: { in: slugs } }, select: { id: true } });
    await prisma.cartItem.createMany({
      data: products.map((p) => ({ userId: userIdOf(token), productId: p.id, quantity })),
    });
  }
  const temps = (from: number, count: number) => Array.from({ length: count }, (_, i) => tempSlug(from + i));

  beforeAll(async () => {
    app = await createTestApp({ mail });
    prisma = app.get(PrismaService);
    const book = buildCatalogSchema.parse((await request(app.getHttpServer()).get('/api/build')).body);
    start = Object.fromEntries(book.slots.map((s) => [s.category, s.defaultSlug!]));
    const { id: categoryId } = await prisma.category.findUniqueOrThrow({ where: { slug: 'accessories' } });
    const part = (slug: string, isActive = true) => ({
      slug,
      name: `Cart Test ${slug.slice(TEMP_PREFIX.length + 1)}`,
      model: 'CT-1',
      module: 'ACCESSORY' as const,
      description: 'Created by the cart e2e suite',
      price: 10000,
      stock: 50,
      isActive,
      categoryId,
    });
    await prisma.product.createMany({
      data: [...temps(0, MAX_CART_LINES + 2).map((slug) => part(slug)), part(WITHDRAWN, false)],
    });
  });

  afterAll(async () => {
    await deleteTestUsers(app);
    await prisma.product.deleteMany({ where: { slug: { startsWith: TEMP_PREFIX } } });
    await app.close();
  });

  describe('guest quote', () => {
    it('prices lines from the database and ignores any price the client sends', async () => {
      const res = await quote([{ slug: 'battery-charger-4a', quantity: 2, price: 1 }]).expect(200);
      const cart = cartSchema.parse(res.body);
      expect(cart.items[0]).toMatchObject({ quantity: 2, lineTotal: 2 * 1_150_000, problem: null });
      expect(cart).toMatchObject({ subtotal: 2_300_000, itemCount: 2, canCheckout: true });
    });

    it('joins duplicate lines, drops unknown parts and falls back to a real finish', async () => {
      const res = await quote([
        { slug: 'e1-frame-m', colorKey: 'moss', quantity: 1 },
        { slug: 'e1-frame-m', colorKey: 'moss', quantity: 2 },
        { slug: 'e1-frame-m', colorKey: 'neon-pink', quantity: 1 },
        { slug: 'no-such-part', quantity: 1 },
      ]).expect(200);
      const cart = cartSchema.parse(res.body);
      expect(cart.items.map((i) => [i.colorKey, i.quantity])).toEqual([
        ['moss', 3],
        ['signal', 1],
      ]);
    });

    it('flags stock problems and blocks checkout', async () => {
      const cart = cartSchema.parse(
        (
          await quote([
            { slug: 'folding-lock', quantity: 1 },
            { slug: 'e1-wheelset-carbon', quantity: 5 },
          ]).expect(200)
        ).body,
      );
      expect(cart.items.map((i) => i.problem)).toEqual(['OUT_OF_STOCK', 'NOT_ENOUGH_STOCK']);
      expect(cart.canCheckout).toBe(false);
    });

    it('prices a bike as the sum of its parts and keeps the browser’s key', async () => {
      const key = crypto.randomUUID();
      const cart = cartSchema.parse(
        (await quote([], [{ key, parts: start, colorKey: 'ember', quantity: 2 }]).expect(200)).body,
      );
      const [bike] = cart.builds;
      expect(bike).toMatchObject({ id: key, quantity: 2, problem: null });
      expect(bike!.quote.colorLabel).toBe('Ember orange');
      expect(bike!.lineTotal).toBe(2 * bike!.quote.parts.reduce((t, p) => t + p.product.price, 0));
      expect(cart).toMatchObject({ subtotal: bike!.lineTotal, itemCount: 2, canCheckout: true });
    });

    it('marks a bike that can no longer be built and blocks checkout', async () => {
      const key = crypto.randomUUID();
      const parts = { ...start, frames: 'e1-frame-s', batteries: 'e1-battery-750' };
      const cart = cartSchema.parse(
        (await quote([], [{ key, parts, colorKey: 'signal', quantity: 1 }]).expect(200)).body,
      );
      expect(cart.builds[0]!.problem).toBe('CANNOT_BUILD');
      // no price for a bike that cannot be built: the parts' sum would leave the missing ones out
      expect(cart.builds[0]!.lineTotal).toBe(0);
      expect(cart.subtotal).toBe(0);
      expect(cart.canCheckout).toBe(false);
    });

    it('counts a part on bikes and on its own against one stock', async () => {
      // 3 carbon wheelsets: 2 on bikes and 2 on their own each fit alone, but not together
      const carbon = { ...start, wheelsets: 'e1-wheelset-carbon' };
      const cart = cartSchema.parse(
        (
          await quote(
            [{ slug: 'e1-wheelset-carbon', quantity: 2 }],
            [{ key: crypto.randomUUID(), parts: carbon, colorKey: 'signal', quantity: 2 }],
          ).expect(200)
        ).body,
      );
      expect(cart.items[0]!.problem).toBe('NOT_ENOUGH_STOCK');
      expect(cart.builds[0]!.problem).toBe('NOT_ENOUGH_STOCK');
      expect(cart.builds[0]!.quote.problems[0]).toMatchObject({ kind: 'OUT_OF_STOCK', slots: ['wheelsets'] });
      expect(cart.canCheckout).toBe(false);
    });

    it('rejects quantities above the per-line limit and negative ones', async () => {
      await quote([{ slug: 'battery-charger-4a', quantity: 11 }]).expect(400);
      await quote([{ slug: 'battery-charger-4a', quantity: -1 }]).expect(400);
      await quote([{ slug: 'battery-charger-4a', quantity: 1.5 }]).expect(400);
    });
  });

  describe('signed-in cart', () => {
    it('requires sign-in', async () => {
      await request(app.getHttpServer()).get('/api/me/cart').expect(401);
    });

    it('sets exact quantities and removes a line at zero', async () => {
      const me = as(await signedInCustomer(app, mail, nextIp()));
      await me.set({ slug: 'lights-front-rear', quantity: 2 }).expect(200);
      await me.set({ slug: 'lights-front-rear', quantity: 3 }).expect(200);
      let cart = cartSchema.parse((await me.get().expect(200)).body);
      expect(cart.items.map((i) => i.quantity)).toEqual([3]);
      await me.set({ slug: 'lights-front-rear', quantity: 0 }).expect(200);
      cart = cartSchema.parse((await me.get().expect(200)).body);
      expect(cart.items).toEqual([]);
    });

    it('adds a bike, joins the same bike added again, and removes it at zero', async () => {
      const me = as(await signedInCustomer(app, mail, nextIp()));
      await me.addBuild({ parts: start, colorKey: 'graphite', quantity: 1 }).expect(200);
      let cart = cartSchema.parse(
        (await me.addBuild({ parts: start, colorKey: 'graphite', quantity: 2 }).expect(200)).body,
      );
      expect(cart.builds.map((b) => b.quantity)).toEqual([3]);
      // another colour is another bike
      cart = cartSchema.parse(
        (await me.addBuild({ parts: start, colorKey: 'moss', quantity: 1 }).expect(200)).body,
      );
      expect(cart.builds).toHaveLength(2);
      cart = cartSchema.parse((await me.setBuild(cart.builds[0]!.id, 0).expect(200)).body);
      expect(cart.builds.map((b) => b.quote.colorKey)).toEqual(['moss']);
    });

    it('refuses a bike that cannot be built, with the reason', async () => {
      const me = as(await signedInCustomer(app, mail, nextIp()));
      const res = await me
        .addBuild({
          parts: { ...start, frames: 'e1-frame-s', forks: 'e1-fork-170' },
          colorKey: 'signal',
          quantity: 1,
        })
        .expect(409);
      expect(res.body.message).toMatch(/160 mm/);
    });

    it('checks stock for the total when the same bike is added again', async () => {
      // 3 carbon wheelsets: 2 bikes fit, then 2 more of the same bike would make 4
      const me = as(await signedInCustomer(app, mail, nextIp()));
      const bike = { parts: { ...start, wheelsets: 'e1-wheelset-carbon' }, colorKey: 'signal' };
      await me.addBuild({ ...bike, quantity: 2 }).expect(200);
      const res = await me.addBuild({ ...bike, quantity: 2 }).expect(409);
      expect(res.body.message).toMatch(/Only 3 of Carbon wheelset C30 left/);
      const cart = cartSchema.parse((await me.get().expect(200)).body);
      expect(cart.builds.map((b) => b.quantity)).toEqual([2]);
    });

    it('merges a cart sent twice under one merge key only once', async () => {
      const me = as(await signedInCustomer(app, mail, nextIp()));
      const mergeKey = crypto.randomUUID();
      const items = [{ slug: 'workshop-hex-set', quantity: 2 }];
      const builds = [{ key: crypto.randomUUID(), parts: start, colorKey: 'signal', quantity: 1 }];
      await me.merge(items, builds, mergeKey).expect(200);
      // the page reloaded before the reply: the browser sends the same cart again
      const again = mergeCartResultSchema.parse((await me.merge(items, builds, mergeKey).expect(200)).body);
      expect(again.notMerged).toEqual([]);
      expect(again.items.find((l) => l.product.slug === 'workshop-hex-set')?.quantity).toBe(2);
      expect(again.builds).toHaveLength(1);
      expect(again.builds[0]?.quantity).toBe(1);
      // the browser signs in as someone else before the reply came: the same cart is not theirs to receive
      const other = as(await signedInCustomer(app, mail, nextIp()));
      const others = cartSchema.parse((await other.merge(items, builds, mergeKey).expect(200)).body);
      expect(others.items).toEqual([]);
      expect(others.builds).toEqual([]);
      // a different cart is a new merge
      const next = cartSchema.parse((await me.merge(items, [], crypto.randomUUID()).expect(200)).body);
      expect(next.items.find((l) => l.product.slug === 'workshop-hex-set')?.quantity).toBe(4);
    });

    it('merges a cart key into one account only, even when two accounts send it at the same moment', async () => {
      const items = [{ slug: 'workshop-hex-set', quantity: 1 }];
      for (let i = 0; i < 5; i += 1) {
        const ana = as(await signedInCustomer(app, mail, nextIp()));
        const budi = as(await signedInCustomer(app, mail, nextIp()));
        const mergeKey = crypto.randomUUID();
        const replies = await Promise.all([ana.merge(items, [], mergeKey), budi.merge(items, [], mergeKey)]);
        const carts = replies.map((r) => mergeCartResultSchema.parse(r.body));
        expect(replies.map((r) => r.status)).toEqual([200, 200]);
        expect(carts.filter((c) => c.items.length > 0)).toHaveLength(1);
      }
    });

    it('answers a malformed bike id with field issues, as it does any malformed input', async () => {
      const me = as(await signedInCustomer(app, mail, nextIp()));
      const res = await me.setBuild('not-a-uuid', 1).expect(400);
      expect(res.body).toMatchObject({ statusCode: 400, message: 'Validation failed' });
      expect(res.body.issues).toHaveLength(1);
    });

    it('merges a guest cart: quantities add up, buildable bikes come along', async () => {
      const me = as(await signedInCustomer(app, mail, nextIp()));
      await me.set({ slug: 'workshop-hex-set', quantity: 8 }).expect(200);
      const cart = mergeCartResultSchema.parse(
        (
          await me
            .merge(
              [
                { slug: 'workshop-hex-set', quantity: 5 },
                { slug: 'e1-cockpit-alloy', quantity: 1 },
              ],
              [
                { key: crypto.randomUUID(), parts: start, colorKey: 'signal', quantity: 1 },
                // only short of stock: kept, with the problem shown, as a single part would be
                {
                  key: crypto.randomUUID(),
                  parts: { ...start, wheelsets: 'e1-wheelset-carbon' },
                  colorKey: 'signal',
                  quantity: 4,
                },
                // cannot be built: left behind rather than failing the sign-in
                {
                  key: crypto.randomUUID(),
                  parts: { ...start, frames: 'e1-frame-s', seats: 'e1-seat-200' },
                  colorKey: 'signal',
                  quantity: 1,
                },
              ],
            )
            .expect(200)
        ).body,
      );
      expect(cart.items.map((i) => [i.product.slug, i.quantity])).toEqual([
        ['workshop-hex-set', 10],
        ['e1-cockpit-alloy', 1],
      ]);
      // 8 + 5 is over a line's limit of 10: the 3 left over are reported
      expect(cart.notMerged).toEqual([{ slug: 'workshop-hex-set', colorKey: '', quantity: 3 }]);
      // both bikes are written in one transaction, so their order is not fixed
      expect(cart.builds.map((b) => b.problem ?? 'none').sort((a, b) => a.localeCompare(b))).toEqual([
        'none',
        'NOT_ENOUGH_STOCK',
      ]);
    });

    it('reports the part of a guest line over the quantity limit, even within the guest cart', async () => {
      const me = as(await signedInCustomer(app, mail, nextIp()));
      const cart = mergeCartResultSchema.parse(
        (
          await me
            .merge([
              { slug: 'workshop-hex-set', quantity: 6 },
              { slug: 'workshop-hex-set', quantity: 6 },
            ])
            .expect(200)
        ).body,
      );
      expect(cart.items.map((i) => [i.product.slug, i.quantity])).toEqual([['workshop-hex-set', 10]]);
      expect(cart.notMerged).toEqual([{ slug: 'workshop-hex-set', colorKey: '', quantity: 2 }]);
    });

    it('reports one total per part, which may pass the line limit, in a reply that still parses', async () => {
      const me = as(await signedInCustomer(app, mail, nextIp()));
      await me.set({ slug: 'workshop-hex-set', quantity: 8 }).expect(200);
      // the guest cart's own cut (20 → 10) and the account's (8 + 10 → 10) are one entry
      const cart = mergeCartResultSchema.parse(
        (
          await me
            .merge([
              { slug: 'workshop-hex-set', quantity: 10 },
              { slug: 'workshop-hex-set', quantity: 10 },
            ])
            .expect(200)
        ).body,
      );
      expect(cart.notMerged).toEqual([{ slug: 'workshop-hex-set', colorKey: '', quantity: 18 }]);
    });

    it('reports parts that did not fit a full cart, and still adds to lines it holds', async () => {
      const token = await signedInCustomer(app, mail, nextIp());
      const me = as(token);
      await fillCart(token, temps(0, MAX_CART_LINES), 8);
      const cart = mergeCartResultSchema.parse(
        (
          await me
            .merge([
              { slug: tempSlug(MAX_CART_LINES), quantity: 2 },
              { slug: tempSlug(0), quantity: 1 },
              { slug: tempSlug(1), quantity: 5 },
            ])
            .expect(200)
        ).body,
      );
      expect(cart.items).toHaveLength(MAX_CART_LINES);
      const quantity = (slug: string) => cart.items.find((i) => i.product.slug === slug)?.quantity;
      expect([quantity(tempSlug(0)), quantity(tempSlug(1))]).toEqual([9, 10]);
      expect(cart.notMerged).toEqual([
        { slug: tempSlug(MAX_CART_LINES), colorKey: '', quantity: 2 },
        { slug: tempSlug(1), colorKey: '', quantity: 3 },
      ]);
    });

    it('does not report unknown or withdrawn parts: the browser drops those itself', async () => {
      const me = as(await signedInCustomer(app, mail, nextIp()));
      const cart = mergeCartResultSchema.parse(
        (
          await me
            .merge([
              { slug: 'no-such-part', quantity: 1 },
              { slug: WITHDRAWN, quantity: 1 },
              { slug: 'workshop-hex-set', quantity: 1 },
            ])
            .expect(200)
        ).body,
      );
      expect(cart.items.map((i) => i.product.slug)).toEqual(['workshop-hex-set']);
      expect(cart.notMerged).toEqual([]);
    });

    it('counts only parts still on sale against the line limit', async () => {
      const token = await signedInCustomer(app, mail, nextIp());
      const me = as(token);
      // 50 rows, one of them a part taken off sale that the cart no longer shows
      await fillCart(token, [...temps(0, MAX_CART_LINES - 1), WITHDRAWN]);
      expect(cartSchema.parse((await me.get().expect(200)).body).items).toHaveLength(MAX_CART_LINES - 1);
      const merged = mergeCartResultSchema.parse(
        (await me.merge([{ slug: tempSlug(MAX_CART_LINES - 1), quantity: 1 }]).expect(200)).body,
      );
      expect(merged.notMerged).toEqual([]);
      expect(merged.items).toHaveLength(MAX_CART_LINES);
      // now the cart is full of parts on sale
      const res = await me.set({ slug: tempSlug(MAX_CART_LINES), quantity: 1 }).expect(409);
      expect(res.body.message).toMatch(/up to 50 different parts/);
    });

    it('takes a 50th part by hand when one of the 50 rows is no longer sold', async () => {
      const token = await signedInCustomer(app, mail, nextIp());
      const me = as(token);
      await fillCart(token, [...temps(0, MAX_CART_LINES - 1), WITHDRAWN]);
      const cart = cartSchema.parse(
        (await me.set({ slug: tempSlug(MAX_CART_LINES - 1), quantity: 1 }).expect(200)).body,
      );
      expect(cart.items).toHaveLength(MAX_CART_LINES);
    });

    it('keeps carts apart between accounts', async () => {
      const ana = as(await signedInCustomer(app, mail, nextIp()));
      const budi = as(await signedInCustomer(app, mail, nextIp()));
      await ana.set({ slug: 'battery-charger-4a', quantity: 1 }).expect(200);
      await ana.addBuild({ parts: start, colorKey: 'signal', quantity: 1 }).expect(200);
      const theirs = cartSchema.parse((await budi.get().expect(200)).body);
      expect(theirs.items).toEqual([]);
      expect(theirs.builds).toEqual([]);
      const mine = cartSchema.parse((await ana.get().expect(200)).body);
      await budi.setBuild(mine.builds[0]!.id, 0).expect(404);
    });
  });
});
