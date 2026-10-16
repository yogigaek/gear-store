import type { INestApplication } from '@nestjs/common';
import { buildCatalogSchema, cartSchema } from '@gear-store/shared';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { createTestApp, FakeMail, nextIp, signedInCustomer, deleteTestUsers } from './setup.js';

describe('Cart (e2e)', () => {
  let app: INestApplication<App>;
  const mail = new FakeMail();
  let start: Record<string, string>;

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
      merge: (items: object[], builds: object[] = []) =>
        auth(server().post('/api/me/cart/merge')).send({ items, builds }),
    };
  };

  beforeAll(async () => {
    app = await createTestApp({ mail });
    const book = buildCatalogSchema.parse((await request(app.getHttpServer()).get('/api/build')).body);
    start = Object.fromEntries(book.slots.map((s) => [s.category, s.defaultSlug!]));
  });

  afterAll(async () => {
    await deleteTestUsers(app);
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

    it('merges a guest cart: quantities add up, buildable bikes come along', async () => {
      const me = as(await signedInCustomer(app, mail, nextIp()));
      await me.set({ slug: 'workshop-hex-set', quantity: 8 }).expect(200);
      const cart = cartSchema.parse(
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
      // both bikes are written in one transaction, so their order is not fixed
      expect(cart.builds.map((b) => b.problem ?? 'none').sort((a, b) => a.localeCompare(b))).toEqual([
        'none',
        'NOT_ENOUGH_STOCK',
      ]);
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
