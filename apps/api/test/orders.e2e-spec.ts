import type { INestApplication } from '@nestjs/common';
import {
  addressSchema,
  buildCatalogSchema,
  cartSchema,
  orderDetailSchema,
  orderSummarySchema,
} from '@gear-store/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { z } from 'zod';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, deleteTestUsers, FakeMail, nextIp, signedInCustomer } from './setup.js';

const ADDRESS = {
  recipient: 'Ana Putri',
  phone: '0812 3456 7890',
  line1: 'Jl. Sudirman No. 1',
  city: 'Pekanbaru',
  province: 'Riau',
  postalCode: '28111',
};
const TEMP_SLUG = `e2e-last-unit-${Date.now()}`;
const WITHDRAWN_SLUG = `e2e-withdrawn-${Date.now()}`;
const FINISH_SLUG = `e2e-finish-${Date.now()}`;

describe('Addresses and orders (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const mail = new FakeMail();
  let start: Record<string, string>;

  function as(token: string) {
    const server = () => app.getHttpServer();
    // each request from its own address, so a test making many stays clear of the per-client rate limit
    const auth = () => ({ Authorization: `Bearer ${token}`, 'X-Forwarded-For': nextIp() });
    return {
      addAddress: (body: object = ADDRESS) =>
        request(server()).post('/api/me/addresses').set(auth()).send(body),
      addresses: () => request(server()).get('/api/me/addresses').set(auth()),
      deleteAddress: (id: string) => request(server()).delete(`/api/me/addresses/${id}`).set(auth()),
      cartSet: (slug: string, quantity: number, colorKey = '') =>
        request(server()).put('/api/me/cart/items').set(auth()).send({ slug, quantity, colorKey }),
      addBike: (parts: Record<string, string>, colorKey = 'signal', quantity = 1) =>
        request(server()).post('/api/me/cart/builds').set(auth()).send({ parts, colorKey, quantity }),
      checkout: (addressId: string, idempotencyKey = randomUUID()) =>
        request(server()).post('/api/me/orders').set(auth()).send({ addressId, idempotencyKey }),
      buyNow: (addressId: string, items: object[], idempotencyKey = randomUUID()) =>
        request(server()).post('/api/me/orders').set(auth()).send({ addressId, idempotencyKey, items }),
      orders: () => request(server()).get('/api/me/orders').set(auth()),
      cart: () => request(server()).get('/api/me/cart').set(auth()),
      order: (n: string) => request(server()).get(`/api/me/orders/${n}`).set(auth()),
      cancel: (n: string) => request(server()).post(`/api/me/orders/${n}/cancel`).set(auth()),
      merge: (items: object[]) =>
        request(server()).post('/api/me/cart/merge').set(auth()).send({ items, builds: [] }),
    };
  }

  async function customerWithAddress() {
    const me = as(await signedInCustomer(app, mail, nextIp()));
    const address = addressSchema.parse((await me.addAddress().expect(201)).body);
    return { me, address };
  }

  const stockOf = async (slug: string) =>
    (await prisma.product.findUniqueOrThrow({ where: { slug }, select: { stock: true } })).stock;

  beforeAll(async () => {
    app = await createTestApp({ mail });
    prisma = app.get(PrismaService);
    // the starting bike from the seeded catalogue, read before the test fork below joins it
    const book = buildCatalogSchema.parse((await request(app.getHttpServer()).get('/api/build')).body);
    start = Object.fromEntries(book.slots.map((s) => [s.category, s.defaultSlug!]));
    const forks = await prisma.category.findUniqueOrThrow({ where: { slug: 'forks' } });
    // a fork, so it can go on a bike as well as be bought on its own
    await prisma.product.create({
      data: {
        slug: TEMP_SLUG,
        name: 'Last Unit Test Fork',
        model: 'T-1',
        module: 'FORK',
        description: 'Created by the e2e suite',
        price: 100000,
        stock: 1,
        categoryId: forks.id,
      },
    });
    const accessories = await prisma.category.findUniqueOrThrow({ where: { slug: 'accessories' } });
    await prisma.product.create({
      data: {
        slug: WITHDRAWN_SLUG,
        name: 'Withdrawn Test Pump',
        model: 'W-1',
        module: 'ACCESSORY',
        description: 'Created by the e2e suite',
        price: 50000,
        stock: 5,
        categoryId: accessories.id,
      },
    });
    await prisma.product.create({
      data: {
        slug: FINISH_SLUG,
        name: 'Finish Test Bell',
        model: 'F-1',
        module: 'ACCESSORY',
        description: 'Created by the e2e suite',
        price: 40000,
        stock: 5,
        categoryId: accessories.id,
        colors: {
          create: [
            { key: 'signal', label: 'Signal yellow', hex: '#f2c230', position: 0 },
            { key: 'moss', label: 'Moss green', hex: '#5b6b3a', position: 1 },
          ],
        },
      },
    });
  });

  afterAll(async () => {
    await deleteTestUsers(app);
    await prisma.product.delete({ where: { slug: TEMP_SLUG } });
    await prisma.product.delete({ where: { slug: WITHDRAWN_SLUG } });
    await prisma.product.delete({ where: { slug: FINISH_SLUG } });
    await app.close();
  });

  describe('addresses', () => {
    it('normalises the phone, prices shipping by province and makes the first address the default', async () => {
      const { me, address } = await customerWithAddress();
      expect(address).toMatchObject({ phone: '+6281234567890', isDefault: true, shippingFee: 35000 });
      const second = addressSchema.parse(
        (await me.addAddress({ ...ADDRESS, province: 'DKI Jakarta', isDefault: true }).expect(201)).body,
      );
      const list = z.array(addressSchema).parse((await me.addresses().expect(200)).body);
      expect(list.filter((a) => a.isDefault).map((a) => a.id)).toEqual([second.id]);
      await me.deleteAddress(second.id).expect(204);
      const after = z.array(addressSchema).parse((await me.addresses().expect(200)).body);
      expect(after).toHaveLength(1);
      expect(after[0]!.isDefault).toBe(true);
    });

    it('rejects a bad phone, postal code or province with field issues', async () => {
      const me = as(await signedInCustomer(app, mail, nextIp()));
      const res = await me
        .addAddress({ ...ADDRESS, phone: '021 555', postalCode: '123', province: 'Atlantis' })
        .expect(400);
      expect(res.body.issues.map((i: { path: string }) => i.path).sort()).toEqual([
        'phone',
        'postalCode',
        'province',
      ]);
    });

    it('will not use or delete another account’s address', async () => {
      const { address } = await customerWithAddress();
      const other = as(await signedInCustomer(app, mail, nextIp()));
      await other.deleteAddress(address.id).expect(404);
      await other.cartSet('battery-charger-4a', 1).expect(200);
      await other.checkout(address.id).expect(404);
    });
  });

  describe('checkout', () => {
    it('prices the order on the server, takes the stock and empties the cart', async () => {
      const { me, address } = await customerWithAddress();
      const before = await stockOf('battery-charger-4a');
      await me.cartSet('battery-charger-4a', 2).expect(200);
      await me.cartSet('e1-frame-m', 1, 'moss').expect(200);
      const order = orderDetailSchema.parse((await me.checkout(address.id).expect(201)).body);

      expect(order.number).toMatch(/^RKT-\d{6}-[A-Z2-9]{6}$/);
      expect(order.status).toBe('PENDING_PAYMENT');
      expect(order.subtotal).toBe(2 * 1_150_000 + 16_900_000);
      expect(order.shippingFee).toBe(35000);
      expect(order.total).toBe(order.subtotal + order.shippingFee);
      expect(order.items.find((i) => i.slug === 'e1-frame-m')?.colorLabel).toBe('Moss green');
      expect(order.builds).toEqual([]);
      expect(order.canPay && order.canCancel).toBe(true);
      expect(await stockOf('battery-charger-4a')).toBe(before - 2);
      expect(cartSchema.parse((await me.cart().expect(200)).body).items).toEqual([]);

      await me.cancel(order.number).expect(200);
    });

    it('holds stock for 60 minutes, and for 10 on a shared demo account', async () => {
      const minutesHeld = (o: { createdAt: string; paymentExpiresAt: string }) =>
        Math.round((Date.parse(o.paymentExpiresAt) - Date.parse(o.createdAt)) / 60_000);

      const customer = await customerWithAddress();
      await customer.me.cartSet('workshop-hex-set', 1).expect(200);
      const regular = orderDetailSchema.parse(
        (await customer.me.checkout(customer.address.id).expect(201)).body,
      );
      expect(minutesHeld(regular)).toBe(60);

      // the demo accounts are seeded; a test account marked as one behaves the same and is cleaned up after
      const demo = await customerWithAddress();
      const { id } = await prisma.user.findFirstOrThrow({
        where: { addresses: { some: { id: demo.address.id } } },
        select: { id: true },
      });
      await prisma.user.update({ where: { id }, data: { isDemo: true } });
      await demo.me.cartSet('workshop-hex-set', 1).expect(200);
      const shared = orderDetailSchema.parse((await demo.me.checkout(demo.address.id).expect(201)).body);
      expect(minutesHeld(shared)).toBe(10);
      expect(shared.events[0]?.note).toBe('Order placed. Pay within 10 minutes.');

      await customer.me.cancel(regular.number).expect(200);
      await demo.me.cancel(shared.number).expect(200);
    });

    it('returns the same order for a repeated idempotency key, even sent twice at once', async () => {
      const { me, address } = await customerWithAddress();
      await me.cartSet('workshop-hex-set', 1).expect(200);
      const key = randomUUID();
      const [a, b] = await Promise.all([me.checkout(address.id, key), me.checkout(address.id, key)]);
      expect([a.status, b.status]).toEqual([201, 201]);
      const numbers = [a.body.number as string, b.body.number as string];
      expect(numbers[1]).toBe(numbers[0]);
      const again = await me.checkout(address.id, key).expect(201);
      expect(again.body.number).toBe(numbers[0]);
      expect(z.array(orderSummarySchema).parse((await me.orders().expect(200)).body)).toHaveLength(1);
      await me.cancel(numbers[0]).expect(200);
    });

    it('runs a checkout and cart changes on one account one after the other: no deadlock, nothing lost', async () => {
      const { me, address } = await customerWithAddress();
      for (let round = 0; round < 40; round += 1) {
        await me.cartSet('workshop-hex-set', 1).expect(200);
        // the merge updates a line the cart holds and inserts a new one, and a part is added, while the checkout runs
        const [placed, merged, added] = await Promise.all([
          me.checkout(address.id),
          me.merge([
            { slug: 'workshop-hex-set', quantity: 1 },
            { slug: 'lights-front-rear', quantity: 1 },
          ]),
          me.cartSet('fender-set', 1),
        ]);
        expect([placed.status, merged.status, added.status], JSON.stringify(placed.body)).toEqual([
          201, 200, 200,
        ]);
        // whichever ran first, every unit sent is either in the order or still in the cart
        const order = orderDetailSchema.parse(placed.body);
        const cart = cartSchema.parse((await me.cart().expect(200)).body);
        const held = (slug: string) =>
          (order.items.find((i) => i.slug === slug)?.quantity ?? 0) +
          (cart.items.find((i) => i.product.slug === slug)?.quantity ?? 0);
        expect([held('workshop-hex-set'), held('lights-front-rear'), held('fender-set')]).toEqual([2, 1, 1]);
        await me.cancel(order.number).expect(200);
        await me.cartSet('workshop-hex-set', 0).expect(200);
        await me.cartSet('lights-front-rear', 0).expect(200);
        await me.cartSet('fender-set', 0).expect(200);
      }
    }, 60_000);

    it('places one order when one account checks out twice at once with different keys', async () => {
      const { me, address } = await customerWithAddress();
      const before = await stockOf('workshop-hex-set');
      await me.cartSet('workshop-hex-set', 1).expect(200);
      const results = await Promise.all([me.checkout(address.id), me.checkout(address.id)]);
      expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([201, 400]);
      expect(results.find((r) => r.status === 400)?.body.message).toBe('Your cart is empty');
      const listed = z.array(orderSummarySchema).parse((await me.orders().expect(200)).body);
      expect(listed).toHaveLength(1);
      expect(await stockOf('workshop-hex-set')).toBe(before - 1);
      await me.cancel(listed[0]!.number).expect(200);
    });

    it('takes a part no longer sold out of the cart instead of blocking checkout for good', async () => {
      const { me, address } = await customerWithAddress();
      await me.cartSet(WITHDRAWN_SLUG, 2).expect(200);
      await me.cartSet('battery-charger-4a', 1).expect(200);
      await prisma.product.update({ where: { slug: WITHDRAWN_SLUG }, data: { isActive: false } });
      try {
        // the cart no longer shows it, so the shopper could not remove it by hand
        const shown = cartSchema.parse((await me.cart().expect(200)).body);
        expect(shown.items.map((i) => i.product.slug)).toEqual(['battery-charger-4a']);
        const refused = await me.checkout(address.id).expect(409);
        expect(refused.body.message).toMatch(/Withdrawn Test Pump/);
        expect(await prisma.cartItem.count({ where: { product: { slug: WITHDRAWN_SLUG } } })).toBe(0);
        // the shopper looks again and the cart they see goes through
        const order = orderDetailSchema.parse((await me.checkout(address.id).expect(201)).body);
        expect(order.items.map((i) => i.slug)).toEqual(['battery-charger-4a']);
        expect(await stockOf(WITHDRAWN_SLUG)).toBe(5);
        await me.cancel(order.number).expect(200);
      } finally {
        await prisma.product.update({ where: { slug: WITHDRAWN_SLUG }, data: { isActive: true } });
      }
    });

    it('sells the last unit to exactly one of two buyers checking out at the same moment', async () => {
      const ana = await customerWithAddress();
      const budi = await customerWithAddress();
      await ana.me.cartSet(TEMP_SLUG, 1).expect(200);
      await budi.me.cartSet(TEMP_SLUG, 1).expect(200);
      const results = await Promise.all([ana.me.checkout(ana.address.id), budi.me.checkout(budi.address.id)]);
      expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([201, 409]);
      expect(results.find((r) => r.status === 409)?.body.message).toMatch(/sold out/);
      expect(await stockOf(TEMP_SLUG)).toBe(0);

      const winner = results.find((r) => r.status === 201)!.body.number as string;
      const owner = results[0]!.status === 201 ? ana.me : budi.me;
      await owner.cancel(winner).expect(200);
      expect(await stockOf(TEMP_SLUG)).toBe(1);
    });

    it('sells a bike as its parts: each part’s stock taken, the build kept together on the order', async () => {
      const { me, address } = await customerWithAddress();
      const before = await Promise.all(Object.values(start).map(stockOf));
      await me.addBike(start, 'ember', 2).expect(200);
      const order = orderDetailSchema.parse((await me.checkout(address.id).expect(201)).body);

      const [bike] = order.builds;
      expect(bike).toMatchObject({ label: 'Rakit E-1', colorLabel: 'Ember orange', quantity: 2 });
      const parts = order.items.filter((i) => i.buildId === bike!.id);
      expect(parts.map((i) => i.slug).sort()).toEqual(Object.values(start).sort());
      expect(parts.every((i) => i.quantity === 2)).toBe(true);
      expect(parts.reduce((t, i) => t + i.lineTotal, 0)).toBe(bike!.lineTotal);
      expect(order.subtotal).toBe(bike!.lineTotal);
      // the list counts bikes, not the parts they are made of
      const listed = z.array(orderSummarySchema).parse((await me.orders().expect(200)).body);
      expect(listed.find((o) => o.number === order.number)?.itemCount).toBe(2);
      expect(await Promise.all(Object.values(start).map(stockOf))).toEqual(before.map((n) => n - 2));
      expect(cartSchema.parse((await me.cart().expect(200)).body).builds).toEqual([]);

      await me.cancel(order.number).expect(200);
      expect(await Promise.all(Object.values(start).map(stockOf))).toEqual(before);
    });

    it('counts a part on a bike and the same part on its own against one stock', async () => {
      const { me, address } = await customerWithAddress();
      await me.addBike({ ...start, forks: TEMP_SLUG }).expect(200);
      await me.cartSet(TEMP_SLUG, 1).expect(200);
      const res = await me.checkout(address.id).expect(409);
      expect(res.body.message).toBe('Only 1 of Last Unit Test Fork left. Lower the quantity in your cart.');
      expect(await stockOf(TEMP_SLUG)).toBe(1);
    });

    it('keeps a part whose finish was withdrawn as one line under its first finish, through changes and checkout', async () => {
      const { me, address } = await customerWithAddress();
      const { userId } = await prisma.address.findUniqueOrThrow({
        where: { id: address.id },
        select: { userId: true },
      });
      const { id: productId } = await prisma.product.findUniqueOrThrow({ where: { slug: FINISH_SLUG } });
      const stored = () =>
        prisma.cartItem.findMany({ where: { userId }, select: { colorKey: true, quantity: true } });
      const shown = (cart: unknown) =>
        cartSchema.parse(cart).items.map((i) => [i.product.slug, i.colorKey, i.colorLabel, i.quantity]);

      await me.cartSet(FINISH_SLUG, 1, 'signal').expect(200);
      await me.cartSet(FINISH_SLUG, 2, 'moss').expect(200);
      const moss = await prisma.productColor.findUniqueOrThrow({
        where: { productId_key: { productId, key: 'moss' } },
      });
      await prisma.productColor.delete({ where: { id: moss.id } });
      try {
        expect(shown((await me.cart().expect(200)).body)).toEqual([
          [FINISH_SLUG, 'signal', 'Signal yellow', 3],
        ]);
        expect(await stored()).toEqual([{ colorKey: 'signal', quantity: 3 }]);

        // a client still holding the old finish changes that same line, and removing it empties the cart
        const changed = await me.cartSet(FINISH_SLUG, 4, 'moss').expect(200);
        expect(shown(changed.body)).toEqual([[FINISH_SLUG, 'signal', 'Signal yellow', 4]]);
        expect(await stored()).toEqual([{ colorKey: 'signal', quantity: 4 }]);
        await me.cartSet(FINISH_SLUG, 0, 'signal').expect(200);
        expect(shown((await me.cart().expect(200)).body)).toEqual([]);
        expect(await stored()).toEqual([]);

        // a row still saved under the old finish, changed before the cart is read again
        await prisma.cartItem.create({ data: { userId, productId, colorKey: 'moss', quantity: 2 } });
        const set = await me.cartSet(FINISH_SLUG, 1, 'signal').expect(200);
        expect(shown(set.body)).toEqual([[FINISH_SLUG, 'signal', 'Signal yellow', 1]]);
        expect(await stored()).toEqual([{ colorKey: 'signal', quantity: 1 }]);

        // and one checked out before the cart is read again: ordered under the finish the cart shows
        await prisma.cartItem.create({ data: { userId, productId, colorKey: 'moss', quantity: 2 } });
        const order = orderDetailSchema.parse((await me.checkout(address.id).expect(201)).body);
        expect(order.items.map((i) => [i.slug, i.colorKey, i.colorLabel, i.quantity])).toEqual([
          [FINISH_SLUG, 'signal', 'Signal yellow', 3],
        ]);
        expect(await stockOf(FINISH_SLUG)).toBe(2);
        expect(await stored()).toEqual([]);
        await me.cancel(order.number).expect(200);
        expect(await stockOf(FINISH_SLUG)).toBe(5);
      } finally {
        const { id: _id, ...colour } = moss;
        await prisma.productColor.create({ data: colour });
      }
    });

    it('refuses an empty cart', async () => {
      const { me, address } = await customerWithAddress();
      const res = await me.checkout(address.id).expect(400);
      expect(res.body.message).toMatch(/empty/);
    });
  });

  describe('buy now', () => {
    it('orders only the given part and leaves the cart and its bikes exactly as they were', async () => {
      const { me, address } = await customerWithAddress();
      await me.cartSet('battery-charger-4a', 2).expect(200);
      await me.addBike(start, 'ember').expect(200);
      const cartBefore = cartSchema.parse((await me.cart().expect(200)).body);
      const before = await stockOf('lights-front-rear');

      const order = orderDetailSchema.parse(
        (await me.buyNow(address.id, [{ slug: 'lights-front-rear', quantity: 2 }]).expect(201)).body,
      );
      expect(order.items.map((i) => [i.slug, i.quantity, i.lineTotal])).toEqual([
        ['lights-front-rear', 2, 2 * 650_000],
      ]);
      expect(order.builds).toEqual([]);
      expect(order.subtotal).toBe(2 * 650_000);
      expect(order.shippingFee).toBe(35000);
      expect(order.total).toBe(order.subtotal + order.shippingFee);
      expect(await stockOf('lights-front-rear')).toBe(before - 2);
      expect(cartSchema.parse((await me.cart().expect(200)).body)).toEqual(cartBefore);

      await me.cancel(order.number).expect(200);
      expect(await stockOf('lights-front-rear')).toBe(before);
    });

    it('refuses a part it does not know, or no longer sells, and takes nothing', async () => {
      const { me, address } = await customerWithAddress();
      const before = await stockOf('workshop-hex-set');
      const unknown = await me
        .buyNow(address.id, [
          { slug: 'workshop-hex-set', quantity: 1 },
          { slug: 'no-such-part', quantity: 1 },
        ])
        .expect(404);
      expect(unknown.body.message).toBe('Part not found');

      await prisma.product.update({ where: { slug: WITHDRAWN_SLUG }, data: { isActive: false } });
      try {
        const withdrawn = await me.buyNow(address.id, [{ slug: WITHDRAWN_SLUG, quantity: 1 }]).expect(409);
        expect(withdrawn.body.message).toMatch(/Withdrawn Test Pump/);
        expect(await stockOf(WITHDRAWN_SLUG)).toBe(5);
      } finally {
        await prisma.product.update({ where: { slug: WITHDRAWN_SLUG }, data: { isActive: true } });
      }
      expect(await stockOf('workshop-hex-set')).toBe(before);
      expect(z.array(orderSummarySchema).parse((await me.orders().expect(200)).body)).toEqual([]);
    });

    it('joins lines of one part and finish, and refuses more than 10 of it or no items at all', async () => {
      const { me, address } = await customerWithAddress();
      const tooMany = await me
        .buyNow(address.id, [
          { slug: 'workshop-hex-set', quantity: 6 },
          { slug: 'workshop-hex-set', quantity: 5 },
        ])
        .expect(400);
      expect(tooMany.body.message).toMatch(/At most 10 of/);
      const empty = await me.buyNow(address.id, []).expect(400);
      expect(empty.body.issues.map((i: { path: string }) => i.path)).toEqual(['items']);
      expect(z.array(orderSummarySchema).parse((await me.orders().expect(200)).body)).toEqual([]);
    });

    it('gives a finish the part no longer has its first finish, as the cart does', async () => {
      const { me, address } = await customerWithAddress();
      const order = orderDetailSchema.parse(
        (
          await me
            .buyNow(address.id, [
              { slug: 'e1-frame-m', colorKey: 'neon-pink', quantity: 1 },
              { slug: 'e1-frame-m', colorKey: 'signal', quantity: 1 },
              { slug: 'battery-charger-4a', colorKey: 'moss', quantity: 1 },
            ])
            .expect(201)
        ).body,
      );
      const lines = order.items.toSorted((a, b) => a.slug.localeCompare(b.slug));
      expect(lines.map((i) => [i.slug, i.colorKey, i.colorLabel, i.quantity])).toEqual([
        ['battery-charger-4a', '', null, 1],
        ['e1-frame-m', 'signal', 'Signal yellow', 2],
      ]);
      await me.cancel(order.number).expect(200);
    });

    it('returns one order for a repeated key, sent twice at once or again later with another body', async () => {
      const { me, address } = await customerWithAddress();
      const before = await stockOf('workshop-hex-set');
      const key = randomUUID();
      const items = [{ slug: 'workshop-hex-set', quantity: 2 }];
      const [a, b] = await Promise.all([
        me.buyNow(address.id, items, key),
        me.buyNow(address.id, items, key),
      ]);
      expect([a.status, b.status]).toEqual([201, 201]);
      expect(b.body.number).toBe(a.body.number);
      const again = await me
        .buyNow(address.id, [{ slug: 'lights-front-rear', quantity: 1 }], key)
        .expect(201);
      expect(again.body.number).toBe(a.body.number);
      expect(z.array(orderSummarySchema).parse((await me.orders().expect(200)).body)).toHaveLength(1);
      expect(await stockOf('workshop-hex-set')).toBe(before - 2);
      await me.cancel(a.body.number as string).expect(200);
      expect(await stockOf('workshop-hex-set')).toBe(before);
    });

    it('runs alongside a cart checkout on the same account: both orders placed, or the loser told why', async () => {
      const { me, address } = await customerWithAddress();
      const hex = await stockOf('workshop-hex-set');
      const lights = await stockOf('lights-front-rear');
      for (let round = 0; round < 10; round += 1) {
        await me.cartSet('workshop-hex-set', 1).expect(200);
        const [bought, placed] = await Promise.all([
          me.buyNow(address.id, [{ slug: 'lights-front-rear', quantity: 1 }]),
          me.checkout(address.id),
        ]);
        expect([bought.status, placed.status], JSON.stringify([bought.body, placed.body])).toEqual([
          201, 201,
        ]);
        expect(orderDetailSchema.parse(bought.body).items.map((i) => i.slug)).toEqual(['lights-front-rear']);
        expect(orderDetailSchema.parse(placed.body).items.map((i) => i.slug)).toEqual(['workshop-hex-set']);
        expect(cartSchema.parse((await me.cart().expect(200)).body).items).toEqual([]);
        expect([await stockOf('workshop-hex-set'), await stockOf('lights-front-rear')]).toEqual([
          hex - 1,
          lights - 1,
        ]);
        await me.cancel(bought.body.number as string).expect(200);
        await me.cancel(placed.body.number as string).expect(200);
      }

      // both after the last unit: one gets it, the other a 409, and the cart keeps it only if the cart lost
      for (let round = 0; round < 5; round += 1) {
        await me.cartSet(TEMP_SLUG, 1).expect(200);
        const [bought, placed] = await Promise.all([
          me.buyNow(address.id, [{ slug: TEMP_SLUG, quantity: 1 }]),
          me.checkout(address.id),
        ]);
        expect([bought.status, placed.status].sort((a, b) => a - b)).toEqual([201, 409]);
        expect(await stockOf(TEMP_SLUG)).toBe(0);
        const cart = cartSchema.parse((await me.cart().expect(200)).body);
        expect(cart.items.map((i) => i.product.slug)).toEqual(bought.status === 201 ? [TEMP_SLUG] : []);
        const winner = bought.status === 201 ? bought : placed;
        await me.cancel(winner.body.number as string).expect(200);
        expect(await stockOf(TEMP_SLUG)).toBe(1);
        await me.cartSet(TEMP_SLUG, 0).expect(200);
      }
    }, 60_000);

    it('refuses more than is in stock with the checkout’s 409', async () => {
      const { me, address } = await customerWithAddress();
      const res = await me.buyNow(address.id, [{ slug: TEMP_SLUG, quantity: 2 }]).expect(409);
      // Buy now leaves the cart alone, so the message does not send the shopper there
      expect(res.body.message).toBe('Only 1 of Last Unit Test Fork left.');
      expect(await stockOf(TEMP_SLUG)).toBe(1);
    });
  });

  describe('limits on orders waiting for payment', () => {
    const markDemo = async (addressId: string) => {
      const { userId } = await prisma.address.findUniqueOrThrow({
        where: { id: addressId },
        select: { userId: true },
      });
      await prisma.user.update({ where: { id: userId }, data: { isDemo: true } });
    };
    const hex = (quantity = 1) => [{ slug: 'workshop-hex-set', quantity }];

    it('lets an account hold 3 orders waiting for payment and refuses a 4th, by cart or Buy now', async () => {
      const { me, address } = await customerWithAddress();
      const placed = [];
      for (let i = 0; i < 3; i += 1)
        placed.push(orderDetailSchema.parse((await me.buyNow(address.id, hex()).expect(201)).body));
      const before = await stockOf('workshop-hex-set');
      const fourth = await me.buyNow(address.id, hex()).expect(409);
      expect(fourth.body).toMatchObject({ code: 'TOO_MANY_UNPAID_ORDERS' });
      expect(fourth.body.message).toBe(
        'You have 3 orders waiting for payment. Pay or cancel one of them before placing another.',
      );
      await me.cartSet('workshop-hex-set', 1).expect(200);
      expect((await me.checkout(address.id).expect(409)).body.code).toBe('TOO_MANY_UNPAID_ORDERS');
      expect(await stockOf('workshop-hex-set')).toBe(before);
      // the cart is left for when there is room
      expect(cartSchema.parse((await me.cart().expect(200)).body).items).toHaveLength(1);
      // a repeated key still answers with its order
      const key = randomUUID();
      await prisma.order.update({ where: { number: placed[0]!.number }, data: { idempotencyKey: key } });
      expect((await me.buyNow(address.id, hex(), key).expect(201)).body.number).toBe(placed[0]!.number);

      // a cancelled or expired order makes room
      await me.cancel(placed[0]!.number).expect(200);
      await prisma.order.update({
        where: { number: placed[1]!.number },
        data: { paymentExpiresAt: new Date(Date.now() - 1000) },
      });
      const next = orderDetailSchema.parse((await me.checkout(address.id).expect(201)).body);
      const another = orderDetailSchema.parse((await me.buyNow(address.id, hex()).expect(201)).body);
      for (const n of [placed[2]!.number, next.number, another.number]) await me.cancel(n).expect(200);
    });

    it('replaces a demo account’s waiting order with the new one, so a demo checkout is never refused', async () => {
      const { me, address } = await customerWithAddress();
      await markDemo(address.id);
      const before = await stockOf('workshop-hex-set');
      const first = orderDetailSchema.parse((await me.buyNow(address.id, hex(2)).expect(201)).body);
      expect(await stockOf('workshop-hex-set')).toBe(before - 2);
      // another visitor of the shared account checks out while the first order is still unpaid
      const second = orderDetailSchema.parse((await me.buyNow(address.id, hex()).expect(201)).body);
      const replaced = orderDetailSchema.parse((await me.order(first.number).expect(200)).body);
      expect(replaced.status).toBe('CANCELLED');
      expect(replaced.canPay).toBe(false);
      expect(replaced.events.at(-1)?.note).toBe(
        'Replaced by a newer demo order. The items went back on sale.',
      );
      expect(await stockOf('workshop-hex-set')).toBe(before - 1);
      // by cart too, and only one order is ever left waiting
      await me.cartSet('workshop-hex-set', 1).expect(200);
      const third = orderDetailSchema.parse((await me.checkout(address.id).expect(201)).body);
      const listed = z.array(orderSummarySchema).parse((await me.orders().expect(200)).body);
      expect(listed.filter((o) => o.status === 'PENDING_PAYMENT').map((o) => o.number)).toEqual([
        third.number,
      ]);
      expect(listed.find((o) => o.number === second.number)?.status).toBe('CANCELLED');
      await me.cancel(third.number).expect(200);
      expect(await stockOf('workshop-hex-set')).toBe(before);
    });

    it('replaces a demo order while a cancel of that order is half done, without a deadlock', async () => {
      const { me, address } = await customerWithAddress();
      await markDemo(address.id);
      const before = await stockOf('workshop-hex-set');
      const first = orderDetailSchema.parse((await me.buyNow(address.id, hex()).expect(201)).body);
      const { id: orderId } = await prisma.order.findUniqueOrThrow({ where: { number: first.number } });
      const { id: productId } = await prisma.product.findUniqueOrThrow({
        where: { slug: 'workshop-hex-set' },
      });
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      let started!: () => void;
      const holding = new Promise<void>((resolve) => (started = resolve));
      // what close() does, paused between its two steps: the order row moved (and locked), stock not yet back
      const closing = prisma.$transaction(
        async (tx) => {
          await tx.order.updateMany({
            where: { id: orderId, status: 'PENDING_PAYMENT' },
            data: { status: 'CANCELLED', closedAt: new Date() },
          });
          started();
          await gate;
          await tx.product.update({ where: { id: productId }, data: { stock: { increment: 1 } } });
        },
        { timeout: 20_000 },
      );
      await holding;
      const replacing = Promise.resolve(me.buyNow(address.id, hex()));
      // the checkout reaches the order row the half-done cancel holds, and waits for it
      let waiting = 0;
      for (let i = 0; i < 100 && waiting === 0; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        [{ waiting }] = await prisma.$queryRaw<{ waiting: number }[]>`
          SELECT count(*)::int AS waiting FROM pg_stat_activity
          WHERE datname = current_database() AND pid <> pg_backend_pid()
            AND wait_event_type = 'Lock' AND query LIKE '%"Order"%'`;
      }
      expect(waiting).toBeGreaterThan(0);
      release();
      const [closed, placed] = await Promise.allSettled([closing, replacing]);
      expect(closed.status).toBe('fulfilled');
      expect(placed.status === 'fulfilled' && placed.value.status).toBe(201);
      const next = orderDetailSchema.parse((placed as PromiseFulfilledResult<request.Response>).value.body);
      expect(await stockOf('workshop-hex-set')).toBe(before - 1);
      await me.cancel(next.number).expect(200);
      expect(await stockOf('workshop-hex-set')).toBe(before);
    });

    it('keeps a demo account’s waiting order when the new one is refused', async () => {
      const { me, address } = await customerWithAddress();
      await markDemo(address.id);
      const first = orderDetailSchema.parse((await me.buyNow(address.id, hex()).expect(201)).body);
      await me.buyNow(address.id, hex(6)).expect(409);
      await me.buyNow(address.id, [{ slug: TEMP_SLUG, quantity: 2 }]).expect(409);
      expect(orderDetailSchema.parse((await me.order(first.number).expect(200)).body).status).toBe(
        'PENDING_PAYMENT',
      );
      await me.cancel(first.number).expect(200);
    });

    it('caps a demo order at 5 items, a bike counting as one', async () => {
      const { me, address } = await customerWithAddress();
      await markDemo(address.id);
      const before = await stockOf('workshop-hex-set');
      const six = await me
        .buyNow(address.id, [...hex(4), { slug: 'lights-front-rear', quantity: 2 }])
        .expect(409);
      expect(six.body).toMatchObject({
        code: 'DEMO_ORDER_TOO_LARGE',
        message: 'A demo order holds at most 5 items. Remove some and try again.',
      });
      expect(await stockOf('workshop-hex-set')).toBe(before);
      const five = orderDetailSchema.parse(
        (await me.buyNow(address.id, [...hex(3), { slug: 'lights-front-rear', quantity: 2 }]).expect(201))
          .body,
      );
      await me.cancel(five.number).expect(200);

      await me.addBike(start, 'ember', 1).expect(200);
      await me.cartSet('battery-charger-4a', 5).expect(200);
      expect((await me.checkout(address.id).expect(409)).body.code).toBe('DEMO_ORDER_TOO_LARGE');
      await me.cartSet('battery-charger-4a', 4).expect(200);
      const bike = orderDetailSchema.parse((await me.checkout(address.id).expect(201)).body);
      expect(bike.builds).toHaveLength(1);
      await me.cancel(bike.number).expect(200);
    });

    it('does not cap the size of an ordinary account’s order beyond the per-line limit', async () => {
      const { me, address } = await customerWithAddress();
      const order = orderDetailSchema.parse(
        (await me.buyNow(address.id, [...hex(3), { slug: 'lights-front-rear', quantity: 3 }]).expect(201))
          .body,
      );
      await me.cancel(order.number).expect(200);
    });
  });

  describe('after checkout', () => {
    it('cancels once, returns the stock, and records the timeline', async () => {
      const { me, address } = await customerWithAddress();
      const before = await stockOf('e1-cockpit-alloy');
      await me.cartSet('e1-cockpit-alloy', 2).expect(200);
      const order = orderDetailSchema.parse((await me.checkout(address.id).expect(201)).body);
      const cancelled = orderDetailSchema.parse((await me.cancel(order.number).expect(200)).body);
      expect(cancelled.status).toBe('CANCELLED');
      expect(cancelled.events.map((e) => e.status)).toEqual(['PENDING_PAYMENT', 'CANCELLED']);
      expect(cancelled.canPay).toBe(false);
      expect(await stockOf('e1-cockpit-alloy')).toBe(before);
      await me.cancel(order.number).expect(409);
    });

    it('expires an unpaid order after its payment window and releases the stock', async () => {
      const { me, address } = await customerWithAddress();
      const before = await stockOf('lights-front-rear');
      await me.cartSet('lights-front-rear', 3).expect(200);
      const order = orderDetailSchema.parse((await me.checkout(address.id).expect(201)).body);
      expect(await stockOf('lights-front-rear')).toBe(before - 3);
      await prisma.order.update({
        where: { number: order.number },
        data: { paymentExpiresAt: new Date(Date.now() - 1000) },
      });
      const expired = orderDetailSchema.parse((await me.order(order.number).expect(200)).body);
      expect(expired.status).toBe('EXPIRED');
      expect(await stockOf('lights-front-rear')).toBe(before);
    });

    it('hides orders from other accounts and rejects malformed numbers', async () => {
      const { me, address } = await customerWithAddress();
      await me.cartSet('battery-charger-4a', 1).expect(200);
      const order = orderDetailSchema.parse((await me.checkout(address.id).expect(201)).body);
      const other = as(await signedInCustomer(app, mail, nextIp()));
      await other.order(order.number).expect(404);
      await other.cancel(order.number).expect(404);
      await other.order('not-an-order').expect(400);
      await me.cancel(order.number).expect(200);
    });
  });
});
