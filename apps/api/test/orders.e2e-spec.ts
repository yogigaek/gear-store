import type { INestApplication } from '@nestjs/common';
import { addressSchema, cartSchema, orderDetailSchema, orderSummarySchema } from '@gear-store/shared';
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

describe('Addresses and orders (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const mail = new FakeMail();

  function as(token: string) {
    const server = () => app.getHttpServer();
    const auth = { Authorization: `Bearer ${token}` };
    return {
      addAddress: (body: object = ADDRESS) =>
        request(server()).post('/api/me/addresses').set(auth).send(body),
      addresses: () => request(server()).get('/api/me/addresses').set(auth),
      deleteAddress: (id: string) => request(server()).delete(`/api/me/addresses/${id}`).set(auth),
      cartSet: (slug: string, quantity: number, colorKey = '') =>
        request(server()).put('/api/me/cart/items').set(auth).send({ slug, quantity, colorKey }),
      checkout: (addressId: string, idempotencyKey = randomUUID()) =>
        request(server())
          .post('/api/me/orders')
          .set(auth)
          .set('X-Forwarded-For', nextIp())
          .send({ addressId, idempotencyKey }),
      orders: () => request(server()).get('/api/me/orders').set(auth),
      cart: () => request(server()).get('/api/me/cart').set(auth),
      order: (n: string) => request(server()).get(`/api/me/orders/${n}`).set(auth),
      cancel: (n: string) => request(server()).post(`/api/me/orders/${n}/cancel`).set(auth),
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
    const audio = await prisma.category.findUniqueOrThrow({ where: { slug: 'audio' } });
    await prisma.product.create({
      data: {
        slug: TEMP_SLUG,
        name: 'Last Unit Test Item',
        model: 'T-1',
        brand: 'Test',
        description: 'Created by the e2e suite',
        price: 100000,
        stock: 1,
        categoryId: audio.id,
      },
    });
  });

  afterAll(async () => {
    await deleteTestUsers(app);
    await prisma.product.delete({ where: { slug: TEMP_SLUG } });
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
      await other.cartSet('c-65-gan-charger', 1).expect(200);
      await other.checkout(address.id).expect(404);
    });
  });

  describe('checkout', () => {
    it('prices the order on the server, takes the stock and empties the cart', async () => {
      const { me, address } = await customerWithAddress();
      const before = await stockOf('c-65-gan-charger');
      await me.cartSet('c-65-gan-charger', 2).expect(200);
      await me.cartSet('h-40-anc-headphone', 1, 'olive').expect(200);
      const order = orderDetailSchema.parse((await me.checkout(address.id).expect(201)).body);

      expect(order.number).toMatch(/^RKT-\d{6}-[A-Z2-9]{6}$/);
      expect(order.status).toBe('PENDING_PAYMENT');
      expect(order.subtotal).toBe(2 * 399000 + 1249000);
      expect(order.shippingFee).toBe(35000);
      expect(order.total).toBe(order.subtotal + order.shippingFee);
      expect(order.items.find((i) => i.slug === 'h-40-anc-headphone')?.colorLabel).toBe('Olive');
      expect(order.canPay && order.canCancel).toBe(true);
      expect(await stockOf('c-65-gan-charger')).toBe(before - 2);
      expect(cartSchema.parse((await me.cart().expect(200)).body).items).toEqual([]);

      await me.cancel(order.number).expect(200);
    });

    it('returns the same order for a repeated idempotency key, even sent twice at once', async () => {
      const { me, address } = await customerWithAddress();
      await me.cartSet('cb-2-usb-c-cable', 1).expect(200);
      const key = randomUUID();
      const [a, b] = await Promise.all([me.checkout(address.id, key), me.checkout(address.id, key)]);
      const numbers = [a, b].filter((r) => r.status === 201).map((r) => r.body.number);
      expect(new Set(numbers).size).toBe(1);
      const again = await me.checkout(address.id, key).expect(201);
      expect(again.body.number).toBe(numbers[0]);
      expect(z.array(orderSummarySchema).parse((await me.orders().expect(200)).body)).toHaveLength(1);
      await me.cancel(numbers[0]).expect(200);
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

    it('refuses an empty cart', async () => {
      const { me, address } = await customerWithAddress();
      const res = await me.checkout(address.id).expect(400);
      expect(res.body.message).toMatch(/empty/);
    });
  });

  describe('after checkout', () => {
    it('cancels once, returns the stock, and records the timeline', async () => {
      const { me, address } = await customerWithAddress();
      const before = await stockOf('k-60-low-profile-keyboard');
      await me.cartSet('k-60-low-profile-keyboard', 2).expect(200);
      const order = orderDetailSchema.parse((await me.checkout(address.id).expect(201)).body);
      const cancelled = orderDetailSchema.parse((await me.cancel(order.number).expect(200)).body);
      expect(cancelled.status).toBe('CANCELLED');
      expect(cancelled.events.map((e) => e.status)).toEqual(['PENDING_PAYMENT', 'CANCELLED']);
      expect(cancelled.canPay).toBe(false);
      expect(await stockOf('k-60-low-profile-keyboard')).toBe(before);
      await me.cancel(order.number).expect(409);
    });

    it('expires an unpaid order after its payment window and releases the stock', async () => {
      const { me, address } = await customerWithAddress();
      const before = await stockOf('a-1-usb-c-ethernet');
      await me.cartSet('a-1-usb-c-ethernet', 3).expect(200);
      const order = orderDetailSchema.parse((await me.checkout(address.id).expect(201)).body);
      expect(await stockOf('a-1-usb-c-ethernet')).toBe(before - 3);
      await prisma.order.update({
        where: { number: order.number },
        data: { paymentExpiresAt: new Date(Date.now() - 1000) },
      });
      const expired = orderDetailSchema.parse((await me.order(order.number).expect(200)).body);
      expect(expired.status).toBe('EXPIRED');
      expect(await stockOf('a-1-usb-c-ethernet')).toBe(before);
    });

    it('hides orders from other accounts and rejects malformed numbers', async () => {
      const { me, address } = await customerWithAddress();
      await me.cartSet('c-65-gan-charger', 1).expect(200);
      const order = orderDetailSchema.parse((await me.checkout(address.id).expect(201)).body);
      const other = as(await signedInCustomer(app, mail, nextIp()));
      await other.order(order.number).expect(404);
      await other.cancel(order.number).expect(404);
      await other.order('not-an-order').expect(400);
      await me.cancel(order.number).expect(200);
    });
  });
});
