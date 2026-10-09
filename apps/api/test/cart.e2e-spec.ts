import type { INestApplication } from '@nestjs/common';
import { cartSchema } from '@gear-store/shared';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { createTestApp, FakeMail, nextIp, signedInCustomer, deleteTestUsers } from './setup.js';

describe('Cart (e2e)', () => {
  let app: INestApplication<App>;
  const mail = new FakeMail();

  const quote = (items: object[]) =>
    request(app.getHttpServer()).post('/api/cart/quote').set('X-Forwarded-For', nextIp()).send({ items });
  const as = (token: string) => ({
    get: () => request(app.getHttpServer()).get('/api/me/cart').set('Authorization', `Bearer ${token}`),
    set: (line: object) =>
      request(app.getHttpServer())
        .put('/api/me/cart/items')
        .set('Authorization', `Bearer ${token}`)
        .send(line),
    merge: (items: object[]) =>
      request(app.getHttpServer())
        .post('/api/me/cart/merge')
        .set('Authorization', `Bearer ${token}`)
        .send({ items }),
  });

  beforeAll(async () => {
    app = await createTestApp({ mail });
  });

  afterAll(async () => {
    await deleteTestUsers(app);
    await app.close();
  });

  describe('guest quote', () => {
    it('prices lines from the database and ignores any price the client sends', async () => {
      const res = await quote([{ slug: 'c-65-gan-charger', quantity: 2, price: 1 }]).expect(200);
      const cart = cartSchema.parse(res.body);
      expect(cart.items[0]).toMatchObject({ quantity: 2, lineTotal: 2 * 399000, problem: null });
      expect(cart).toMatchObject({ subtotal: 798000, itemCount: 2, canCheckout: true });
    });

    it('joins duplicate lines, drops unknown products and falls back to a real finish', async () => {
      const res = await quote([
        { slug: 'h-40-anc-headphone', colorKey: 'olive', quantity: 1 },
        { slug: 'h-40-anc-headphone', colorKey: 'olive', quantity: 2 },
        { slug: 'h-40-anc-headphone', colorKey: 'neon-pink', quantity: 1 },
        { slug: 'no-such-product', quantity: 1 },
      ]).expect(200);
      const cart = cartSchema.parse(res.body);
      expect(cart.items.map((i) => [i.colorKey, i.quantity])).toEqual([
        ['olive', 3],
        ['graphite', 1],
      ]);
    });

    it('flags stock problems and blocks checkout', async () => {
      const cart = cartSchema.parse(
        (
          await quote([
            { slug: 'd-7-usb-c-hub', quantity: 1 },
            { slug: 'd-2-usb-c-dac', quantity: 5 },
          ]).expect(200)
        ).body,
      );
      expect(cart.items.map((i) => i.problem)).toEqual(['OUT_OF_STOCK', 'NOT_ENOUGH_STOCK']);
      expect(cart.canCheckout).toBe(false);
    });

    it('rejects quantities above the per-line limit and negative ones', async () => {
      await quote([{ slug: 'c-65-gan-charger', quantity: 11 }]).expect(400);
      await quote([{ slug: 'c-65-gan-charger', quantity: -1 }]).expect(400);
      await quote([{ slug: 'c-65-gan-charger', quantity: 1.5 }]).expect(400);
    });
  });

  describe('signed-in cart', () => {
    it('requires sign-in', async () => {
      await request(app.getHttpServer()).get('/api/me/cart').expect(401);
    });

    it('sets exact quantities and removes a line at zero', async () => {
      const me = as(await signedInCustomer(app, mail, nextIp()));
      await me.set({ slug: 'p-20-power-bank', quantity: 2 }).expect(200);
      await me.set({ slug: 'p-20-power-bank', quantity: 3 }).expect(200);
      let cart = cartSchema.parse((await me.get().expect(200)).body);
      expect(cart.items.map((i) => i.quantity)).toEqual([3]);
      await me.set({ slug: 'p-20-power-bank', quantity: 0 }).expect(200);
      cart = cartSchema.parse((await me.get().expect(200)).body);
      expect(cart.items).toEqual([]);
    });

    it('merges a guest cart: quantities add up and stay under the cap', async () => {
      const me = as(await signedInCustomer(app, mail, nextIp()));
      await me.set({ slug: 'cb-2-usb-c-cable', quantity: 8 }).expect(200);
      const cart = cartSchema.parse(
        (
          await me
            .merge([
              { slug: 'cb-2-usb-c-cable', quantity: 5 },
              { slug: 'k-60-low-profile-keyboard', quantity: 1 },
            ])
            .expect(200)
        ).body,
      );
      expect(cart.items.map((i) => [i.product.slug, i.quantity])).toEqual([
        ['cb-2-usb-c-cable', 10],
        ['k-60-low-profile-keyboard', 1],
      ]);
    });

    it('keeps carts apart between accounts', async () => {
      const ana = as(await signedInCustomer(app, mail, nextIp()));
      const budi = as(await signedInCustomer(app, mail, nextIp()));
      await ana.set({ slug: 'c-65-gan-charger', quantity: 1 }).expect(200);
      expect(cartSchema.parse((await budi.get().expect(200)).body).items).toEqual([]);
    });
  });
});
