import type { INestApplication } from '@nestjs/common';
import {
  addressSchema,
  adminOrderSchema,
  adminProductSchema,
  adminStatsSchema,
  authResponseSchema,
  orderDetailSchema,
} from '@gear-store/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, deleteTestUsers, FakeMail, nextIp, signedInCustomer } from './setup.js';

const TEMP = `e2e-admin-${Date.now()}`;
const PRODUCT = {
  slug: TEMP,
  name: 'Admin Test Product',
  model: 'AT-1',
  category: 'accessories',
  module: 'ACCESSORY',
  description: 'Created by the admin e2e suite.',
  price: 120000,
  stock: 7,
  isActive: true,
  specs: [
    { label: 'Output', value: '20 W' },
    { label: 'Ports', value: '1' },
    { label: 'Weight', value: '50 g' },
  ],
  colors: [{ key: 'white', label: 'White', hex: '#F0F0F0' }],
};

describe('Admin (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const mail = new FakeMail();

  const client = (token?: string) => {
    const withAuth = (r: request.Test) => (token ? r.set('Authorization', `Bearer ${token}`) : r);
    const server = () => app.getHttpServer();
    return {
      get: (url: string) => withAuth(request(server()).get(`/api${url}`)),
      post: (url: string, body?: object) => withAuth(request(server()).post(`/api${url}`)).send(body),
      put: (url: string, body: object) => withAuth(request(server()).put(`/api${url}`)).send(body),
      patch: (url: string, body: object) => withAuth(request(server()).patch(`/api${url}`)).send(body),
      del: (url: string) => withAuth(request(server()).delete(`/api${url}`)),
    };
  };

  async function admin() {
    const token = await signedInCustomer(app, mail, nextIp());
    const me = await client(token).get('/me').expect(200);
    await prisma.user.update({ where: { id: me.body.id }, data: { role: 'ADMIN' } });
    return { token, id: me.body.id as string, api: client(token) };
  }

  async function paidOrder(slug = 'battery-charger-4a') {
    const token = await signedInCustomer(app, mail, nextIp());
    const api = client(token);
    const address = addressSchema.parse(
      (
        await api
          .post('/me/addresses', {
            recipient: 'Ana',
            phone: '081234567890',
            line1: 'Jl. Merdeka 10',
            city: 'Bandung',
            province: 'Jawa Barat',
            postalCode: '40111',
          })
          .expect(201)
      ).body,
    );
    await api.put('/me/cart/items', { slug, quantity: 1 }).expect(200);
    const order = orderDetailSchema.parse(
      (await api.post('/me/orders', { addressId: address.id, idempotencyKey: randomUUID() }).expect(201))
        .body,
    );
    return {
      token,
      api,
      order,
      markPaid: () =>
        prisma.order.update({
          where: { number: order.number },
          data: { status: 'PAID', paidAt: new Date() },
        }),
    };
  }

  beforeAll(async () => {
    app = await createTestApp({ mail });
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await deleteTestUsers(app);
    await prisma.product.deleteMany({ where: { slug: TEMP } });
    await prisma.category.deleteMany({ where: { slug: { startsWith: 'e2e-cat-' } } });
    await app.close();
  });

  describe('access', () => {
    it('is closed to guests and customers', async () => {
      await client().get('/admin/stats').expect(401);
      const customer = client(await signedInCustomer(app, mail, nextIp()));
      await customer.get('/admin/stats').expect(403);
      await customer.post('/admin/products', PRODUCT).expect(403);
    });

    it('lets the demo administrator look but not change anything', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/demo')
        .set('X-Forwarded-For', nextIp())
        .send({ role: 'admin' });
      const demo = client(authResponseSchema.parse(res.body).accessToken);
      await demo.get('/admin/stats').expect(200);
      await demo.get('/admin/orders').expect(200);
      const refused = await demo.post('/admin/products', PRODUCT).expect(403);
      expect(refused.body.message).toMatch(/demo administrator/);
      await demo
        .post('/admin/categories', {
          slug: 'e2e-cat-demo',
          name: 'Nope',
          description: 'Nope',
          sortOrder: 9,
          slot: null,
        })
        .expect(403);
    });

    it('applies a role change on the next request, without signing in again', async () => {
      const boss = await admin();
      const staffToken = await signedInCustomer(app, mail, nextIp());
      const staff = client(staffToken);
      const staffId = (await staff.get('/me').expect(200)).body.id as string;
      await staff.get('/admin/stats').expect(403);
      await boss.api.patch(`/admin/users/${staffId}/role`, { role: 'ADMIN' }).expect(200);
      await staff.get('/admin/stats').expect(200);
      await boss.api.patch(`/admin/users/${staffId}/role`, { role: 'CUSTOMER' }).expect(200);
      await staff.get('/admin/stats').expect(403);
    });

    it('will not change its own role or a demo account’s', async () => {
      const boss = await admin();
      await boss.api.patch(`/admin/users/${boss.id}/role`, { role: 'CUSTOMER' }).expect(400);
      const demo = await prisma.user.findUniqueOrThrow({ where: { email: 'shopper@rakit.example' } });
      await boss.api.patch(`/admin/users/${demo.id}/role`, { role: 'ADMIN' }).expect(403);
    });
  });

  describe('diagnostics', () => {
    it('shows an administrator how a request arrived, and nobody else', async () => {
      const { api } = await admin();
      const res = await api.get('/admin/request-info').set('X-Forwarded-For', '203.0.113.9').expect(200);
      expect(res.body).toMatchObject({ forwardedFor: '203.0.113.9', ip: '203.0.113.9' });
      const customer = client(await signedInCustomer(app, mail, nextIp()));
      await customer.get('/admin/request-info').expect(403);
      await client().get('/admin/request-info').expect(401);
    });
  });

  describe('overview', () => {
    it('counts a newly paid order in revenue, the daily series and best sellers', async () => {
      const { api } = await admin();
      const before = adminStatsSchema.parse((await api.get('/admin/stats?days=7').expect(200)).body);
      expect(before.daily).toHaveLength(7);
      const { order, markPaid } = await paidOrder();
      await markPaid();
      const after = adminStatsSchema.parse((await api.get('/admin/stats?days=7').expect(200)).body);
      expect(after.revenue - before.revenue).toBe(order.total);
      expect(after.paidOrders - before.paidOrders).toBe(1);
      expect(after.daily.at(-1)!.revenue - before.daily.at(-1)!.revenue).toBe(order.total);
      expect(after.awaitingShipment - before.awaitingShipment).toBe(1);
      expect(after.topProducts.some((p) => p.slug === 'battery-charger-4a')).toBe(true);
      await api.get('/admin/stats?days=365').expect(400);
    });
  });

  describe('products', () => {
    it('creates, edits with a freshness check, and takes a product off sale', async () => {
      const { api } = await admin();
      const created = adminProductSchema.parse((await api.post('/admin/products', PRODUCT).expect(201)).body);
      expect(created.colors[0]!.hex).toBe('#f0f0f0');
      await api.post('/admin/products', PRODUCT).expect(409);

      const stale = created.updatedAt;
      const edited = adminProductSchema.parse(
        (
          await api
            .put(`/admin/products/${TEMP}`, { ...PRODUCT, price: 99000, expectedUpdatedAt: stale })
            .expect(200)
        ).body,
      );
      expect(edited.price).toBe(99000);
      // a second save from a form opened before the first one changed it
      const conflict = await api
        .put(`/admin/products/${TEMP}`, { ...PRODUCT, stock: 1, expectedUpdatedAt: stale })
        .expect(409);
      expect(conflict.body.message).toMatch(/changed after you opened it/);

      await api
        .put(`/admin/products/${TEMP}`, { ...PRODUCT, slug: 'renamed', expectedUpdatedAt: edited.updatedAt })
        .expect(400);
      const unknownCategory = await api
        .put(`/admin/products/${TEMP}`, { ...PRODUCT, category: 'nope', expectedUpdatedAt: edited.updatedAt })
        .expect(400);
      expect(unknownCategory.body.issues[0].path).toBe('category');

      await client().get(`/products/${TEMP}`).expect(200);
      await api
        .put(`/admin/products/${TEMP}`, { ...PRODUCT, isActive: false, expectedUpdatedAt: edited.updatedAt })
        .expect(200);
      await client().get(`/products/${TEMP}`).expect(404);
      const list = await api.get(`/admin/products?q=${TEMP}`).expect(200);
      expect(list.body.items[0]).toMatchObject({ slug: TEMP, isActive: false });
    });

    it('refuses an edit when an order took stock after the form was opened', async () => {
      const { api } = await admin();
      const opened = adminProductSchema.parse(
        (await api.get('/admin/products/workshop-hex-set').expect(200)).body,
      );
      const buyer = await paidOrder('workshop-hex-set');
      await api
        .put('/admin/products/workshop-hex-set', { ...opened, expectedUpdatedAt: opened.updatedAt })
        .expect(409);
      await buyer.api.post(`/me/orders/${buyer.order.number}/cancel`).expect(200);
    });
  });

  describe('categories', () => {
    it('creates and edits, and deletes only empty ones', async () => {
      const { api } = await admin();
      const cat = {
        slug: `e2e-cat-${Date.now()}`,
        name: 'Mudguards',
        description: 'Test category',
        sortOrder: 50,
        slot: null,
      };
      await api.post('/admin/categories', cat).expect(201);
      await api.post('/admin/categories', cat).expect(409);
      // a build slot belongs to one part type
      await api.put(`/admin/categories/${cat.slug}`, { ...cat, slot: 0 }).expect(409);
      const edited = await api
        .put(`/admin/categories/${cat.slug}`, { ...cat, name: 'Mudguards & racks' })
        .expect(200);
      expect(edited.body).toMatchObject({ name: 'Mudguards & racks', slot: null, productCount: 0 });
      await api.del('/admin/categories/accessories').expect(409);
      await api.del(`/admin/categories/${cat.slug}`).expect(204);
    });
  });

  describe('orders', () => {
    it('ships a paid order, then delivers it, in that order only', async () => {
      const { api } = await admin();
      const { order, markPaid, api: customer } = await paidOrder();
      const ship = { courier: 'JNE', trackingNumber: ' jp1234567890 ' };
      await api.post(`/admin/orders/${order.number}/ship`, ship).expect(409); // not paid yet
      await markPaid();
      await api.post(`/admin/orders/${order.number}/deliver`).expect(409); // not shipped yet
      const shipped = adminOrderSchema.parse(
        (await api.post(`/admin/orders/${order.number}/ship`, ship).expect(200)).body,
      );
      expect(shipped.fulfilment).toMatchObject({ courier: 'JNE', trackingNumber: 'JP1234567890' });
      await api.post(`/admin/orders/${order.number}/ship`, ship).expect(409);
      await api.post(`/admin/orders/${order.number}/deliver`).expect(200);

      const seen = orderDetailSchema.parse(
        (await customer.get(`/me/orders/${order.number}`).expect(200)).body,
      );
      expect(seen.status).toBe('DELIVERED');
      expect(seen.fulfilment.trackingNumber).toBe('JP1234567890');
      expect(seen.events.map((e) => e.status)).toEqual(['PENDING_PAYMENT', 'SHIPPED', 'DELIVERED']);
    });

    it('rejects an unknown courier or a malformed tracking number', async () => {
      const { api } = await admin();
      const { order, markPaid } = await paidOrder();
      await markPaid();
      const res = await api
        .post(`/admin/orders/${order.number}/ship`, { courier: 'FedEx', trackingNumber: 'x' })
        .expect(400);
      expect(res.body.issues.map((i: { path: string }) => i.path).sort()).toEqual([
        'courier',
        'trackingNumber',
      ]);
    });

    it('records a refund once, only when one is waiting', async () => {
      const { api } = await admin();
      const { order, api: customer } = await paidOrder();
      await api.post(`/admin/orders/${order.number}/refund`).expect(409);
      // cancel the normal way (stock goes back), then flag a late payment as the payment service would
      await customer.post(`/me/orders/${order.number}/cancel`).expect(200);
      await prisma.order.update({ where: { number: order.number }, data: { refundStatus: 'NEEDED' } });
      const list = await api.get('/admin/orders?refund=needed').expect(200);
      expect(list.body.items.some((o: { number: string }) => o.number === order.number)).toBe(true);
      const done = adminOrderSchema.parse(
        (await api.post(`/admin/orders/${order.number}/refund`).expect(200)).body,
      );
      expect(done.refundStatus).toBe('DONE');
      await api.post(`/admin/orders/${order.number}/refund`).expect(409);
    });

    it('finds orders by number or customer email', async () => {
      const { api } = await admin();
      const { order } = await paidOrder();
      const byNumber = await api.get(`/admin/orders?q=${order.number.slice(-6).toLowerCase()}`).expect(200);
      expect(byNumber.body.items.map((o: { number: string }) => o.number)).toContain(order.number);
      const detail = adminOrderSchema.parse(
        (await api.get(`/admin/orders/${order.number}`).expect(200)).body,
      );
      const byEmail = await api
        .get(`/admin/orders?q=${encodeURIComponent(detail.customer.email)}`)
        .expect(200);
      expect(byEmail.body.items).toHaveLength(1);
    });
  });
});
