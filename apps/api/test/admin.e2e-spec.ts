import { Logger, type INestApplication } from '@nestjs/common';
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

  describe('the demo administrator', () => {
    const demoAdmin = async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/demo')
        .set('X-Forwarded-For', nextIp())
        .send({ role: 'admin' });
      return client(authResponseSchema.parse(res.body).accessToken);
    };
    /** every page of a list, so nothing past the first page goes unchecked */
    async function everyPage(api: ReturnType<typeof client>, path: string) {
      const bodies = [];
      for (let page = 1; ; page += 1) {
        const body = (await api.get(`${path}${path.includes('?') ? '&' : '?'}page=${page}&pageSize=100`))
          .body as { items: unknown[]; total: number; pageSize: number };
        bodies.push(body);
        if (page * body.pageSize >= body.total) return bodies;
      }
    }

    it('never sees a real customer’s email, phone or address, while a real administrator does', async () => {
      const { order, markPaid } = await paidOrder();
      await markPaid();
      const real = await prisma.order.findUniqueOrThrow({
        where: { number: order.number },
        select: { shipPhone: true, shipLine1: true, user: { select: { email: true } } },
      });
      const secrets = [real.user.email, real.shipPhone, real.shipLine1, order.number];

      const demo = await demoAdmin();
      const seen = [
        ...(await everyPage(demo, '/admin/users')),
        ...(await everyPage(demo, '/admin/orders')),
        ...(await everyPage(demo, '/admin/orders?status=PAID')),
        (await demo.get(`/admin/users?q=${encodeURIComponent(real.user.email)}`).expect(200)).body,
        (await demo.get(`/admin/orders?q=${encodeURIComponent(real.user.email)}`).expect(200)).body,
        (await demo.get(`/admin/orders?q=${order.number}`).expect(200)).body,
        (await demo.get('/admin/stats?days=90').expect(200)).body,
      ];
      const text = JSON.stringify(seen);
      for (const secret of secrets) expect(text).not.toContain(secret);
      const missing = await demo.get(`/admin/orders/${order.number}`).expect(404);
      expect(missing.body.message).toBe('Order not found');

      // what it does see belongs to demo accounts, the seeded history among them
      const demoIds = new Set(
        (await prisma.user.findMany({ where: { isDemo: true }, select: { id: true } })).map((u) => u.id),
      );
      const users = (await everyPage(demo, '/admin/users')).flatMap((b) => b.items) as { id: string }[];
      expect(users.length).toBeGreaterThan(0);
      expect(users.every((u) => demoIds.has(u.id))).toBe(true);
      const rows = (await everyPage(demo, '/admin/orders')).flatMap((b) => b.items) as { number: string }[];
      expect(rows.length).toBeGreaterThan(0);
      const owners = await prisma.order.findMany({
        where: { number: { in: rows.map((r) => r.number) } },
        select: { userId: true },
      });
      expect(owners.every((o) => demoIds.has(o.userId))).toBe(true);
      adminOrderSchema.parse((await demo.get(`/admin/orders/${rows[0]!.number}`).expect(200)).body);

      // a real administrator still sees everything
      const { api } = await admin();
      const detail = adminOrderSchema.parse(
        (await api.get(`/admin/orders/${order.number}`).expect(200)).body,
      );
      expect(detail.customer.email).toBe(real.user.email);
      expect(detail.shipping.phone).toBe(real.shipPhone);
      const found = await api.get(`/admin/users?q=${encodeURIComponent(real.user.email)}`).expect(200);
      expect(found.body.items).toHaveLength(1);
    });

    it('counts only demo orders on its overview, so the numbers match the lists it can open', async () => {
      const demo = await demoAdmin();
      const stats = adminStatsSchema.parse((await demo.get('/admin/stats?days=90').expect(200)).body);
      const paid = await demo.get('/admin/orders?status=PAID&pageSize=1').expect(200);
      expect(stats.awaitingShipment).toBe(paid.body.total);
      const { markPaid } = await paidOrder();
      await markPaid();
      const after = adminStatsSchema.parse((await demo.get('/admin/stats?days=90').expect(200)).body);
      expect(after.revenue).toBe(stats.revenue);
      expect(after.awaitingShipment).toBe(stats.awaitingShipment);
    });

    it('is refused every change: PUT, PATCH, DELETE and the order actions', async () => {
      const demo = await demoAdmin();
      const { order, markPaid } = await paidOrder();
      await markPaid();
      const product = adminProductSchema.parse(
        (await demo.get('/admin/products/battery-charger-4a').expect(200)).body,
      );
      const customer = await prisma.order.findUniqueOrThrow({
        where: { number: order.number },
        select: { userId: true },
      });
      // built one at a time: supertest starts a request's server when the request is created
      const refusals = [
        () =>
          demo.put('/admin/products/battery-charger-4a', {
            ...product,
            expectedUpdatedAt: product.updatedAt,
          }),
        () =>
          demo.put('/admin/categories/accessories', {
            slug: 'accessories',
            name: 'Nope',
            description: 'Nope',
            sortOrder: 0,
            slot: null,
          }),
        () => demo.del('/admin/categories/accessories'),
        () => demo.patch(`/admin/users/${customer.userId}/role`, { role: 'ADMIN' }),
        () =>
          demo.post(`/admin/orders/${order.number}/ship`, { courier: 'JNE', trackingNumber: 'JP1234567890' }),
        () => demo.post(`/admin/orders/${order.number}/deliver`),
        () => demo.post(`/admin/orders/${order.number}/refund`),
      ];
      for (const send of refusals) {
        const refused = await send().expect(403);
        expect(refused.body.message).toMatch(/demo administrator/);
      }
      expect(
        await prisma.order.findUniqueOrThrow({ where: { number: order.number }, select: { status: true } }),
      ).toEqual({ status: 'PAID' });
      expect(
        await prisma.user.findUniqueOrThrow({ where: { id: customer.userId }, select: { role: true } }),
      ).toEqual({ role: 'CUSTOMER' });
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
      // priced above anything the demo history sold, so it lands among the five best sellers
      const accessories = await prisma.category.findUniqueOrThrow({ where: { slug: 'accessories' } });
      const slug = `e2e-best-seller-${randomUUID().slice(0, 8)}`;
      await prisma.product.create({
        data: {
          slug,
          name: 'Best Seller Test Part',
          model: 'T-BS',
          module: 'ACCESSORY',
          description: 'Created by the e2e suite',
          price: 900_000_000,
          stock: 1,
          categoryId: accessories.id,
        },
      });
      const { order, markPaid } = await paidOrder(slug);
      await markPaid();
      const after = adminStatsSchema.parse((await api.get('/admin/stats?days=7').expect(200)).body);
      expect(after.revenue - before.revenue).toBe(order.total);
      expect(after.paidOrders - before.paidOrders).toBe(1);
      expect(after.daily.at(-1)!.revenue - before.daily.at(-1)!.revenue).toBe(order.total);
      expect(after.awaitingShipment - before.awaitingShipment).toBe(1);
      expect(after.topProducts[0]).toMatchObject({ slug, quantity: 1 });
      await prisma.product.delete({ where: { slug } });
      await api.get('/admin/stats?days=365').expect(400);
    });
  });

  describe('products', () => {
    it('creates, edits with a freshness check, and takes a product off sale', async () => {
      const { api } = await admin();
      // the 3D module has to fit the part type: accessories are drawn as accessories, a slot takes one module
      const wrong = await api.post('/admin/products', { ...PRODUCT, module: 'FRAME' }).expect(400);
      expect(wrong.body.issues).toEqual([expect.objectContaining({ path: 'module' })]);
      const notAFork = await api
        .post('/admin/products', { ...PRODUCT, category: 'forks', module: 'SHOCK' })
        .expect(400);
      expect(notAFork.body.issues[0].message).toMatch(/drawn as fork parts/);
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

  describe('edge cases', () => {
    const missingOrder = 'RKT-000000-ZZZZZZ';

    it('answers 404 for an unknown part, part type, order or account, and creates nothing', async () => {
      const { api } = await admin();
      const ghost = `${TEMP}-ghost`;
      await api.get(`/admin/products/${ghost}`).expect(404);
      await api
        .put(`/admin/products/${ghost}`, {
          ...PRODUCT,
          slug: ghost,
          expectedUpdatedAt: new Date().toISOString(),
        })
        .expect(404);
      const category = {
        slug: 'e2e-cat-ghost',
        name: 'Ghost',
        description: 'Not there',
        sortOrder: 1,
        slot: null,
      };
      await api.put('/admin/categories/e2e-cat-ghost', category).expect(404);
      await api.del('/admin/categories/e2e-cat-ghost').expect(404);
      await api.get(`/admin/orders/${missingOrder}`).expect(404);
      await api
        .post(`/admin/orders/${missingOrder}/ship`, { courier: 'JNE', trackingNumber: 'JP1234567890' })
        .expect(404);
      await api.post(`/admin/orders/${missingOrder}/deliver`).expect(404);
      await api.post(`/admin/orders/${missingOrder}/refund`).expect(404);
      await api.patch(`/admin/users/${randomUUID()}/role`, { role: 'ADMIN' }).expect(404);
      expect(await prisma.product.findUnique({ where: { slug: ghost } })).toBeNull();
      expect(await prisma.category.findUnique({ where: { slug: 'e2e-cat-ghost' } })).toBeNull();
    });

    it('keeps a part type’s slug, and keeps accessories out of build slots', async () => {
      const { api } = await admin();
      const forks = (await api.get('/admin/categories').expect(200)).body.find(
        (c: { slug: string }) => c.slug === 'forks',
      );
      await api.put('/admin/categories/forks', { ...forks, slug: 'forkz' }).expect(400);
      const res = await api
        .post('/admin/products', { ...PRODUCT, slug: `${TEMP}-fork`, category: 'forks', module: 'ACCESSORY' })
        .expect(400);
      expect(res.body.issues).toEqual([
        { path: 'module', message: 'Forks go on the bike: choose the module that draws them' },
      ]);
    });

    it('takes every product field at its limit and refuses each one past it', async () => {
      const { api } = await admin();
      const slug = `${TEMP}-max`;
      const fullest = {
        ...PRODUCT,
        slug,
        name: 'N'.repeat(80),
        model: 'M'.repeat(20),
        description: 'D'.repeat(2000),
        price: 1_000_000_000,
        stock: 100_000,
        specs: Array.from({ length: 20 }, (_, i) => ({
          label: `L${i}`.padEnd(40, 'l'),
          value: 'v'.repeat(80),
        })),
        colors: Array.from({ length: 8 }, (_, i) => ({
          key: `c${i}`,
          label: 'x'.repeat(30),
          hex: '#ABCDEF',
        })),
        // not part of the form: ignored
        id: randomUUID(),
        updatedAt: '2000-01-01T00:00:00.000Z',
      };
      try {
        const created = adminProductSchema.parse(
          (await api.post('/admin/products', fullest).expect(201)).body,
        );
        expect(created).toMatchObject({ name: fullest.name, price: 1_000_000_000, stock: 100_000 });
        expect(created.specs).toHaveLength(20);
        expect(created.colors).toHaveLength(8);
        expect(created.updatedAt).not.toBe(fullest.updatedAt);
        const over: [string, unknown][] = [
          ['name', 'N'.repeat(81)],
          ['model', 'M'.repeat(21)],
          ['description', 'D'.repeat(2001)],
          ['description', 'too short'],
          ['price', 999],
          ['price', 1_000_000_001],
          ['stock', -1],
          ['stock', 100_001],
          ['specs', fullest.specs.slice(0, 2)],
          ['specs', [...fullest.specs, { label: 'one', value: 'more' }]],
          ['colors', [...fullest.colors, { key: 'c8', label: 'one more', hex: '#000000' }]],
          ['colors', [fullest.colors[0], fullest.colors[0]]],
        ];
        for (const [field, value] of over) {
          const res = await api.post('/admin/products', { ...fullest, slug: `${TEMP}-over`, [field]: value });
          expect([field, res.status, res.body.issues?.[0]?.path]).toEqual([field, 400, field]);
        }
        expect(await prisma.product.findUnique({ where: { slug: `${TEMP}-over` } })).toBeNull();
      } finally {
        await prisma.product.deleteMany({ where: { slug } });
      }
    });

    it.each(['products', 'orders', 'users'])(
      'pages the %s list from 1 to 1000, 1 to 100 a page, with searches up to 80 characters',
      async (list) => {
        const { api } = await admin();
        const page = await api.get(`/admin/${list}?pageSize=100&page=1000`).expect(200);
        expect(page.body).toMatchObject({ items: [], page: 1000, pageSize: 100 });
        await api.get(`/admin/${list}?q=${'q'.repeat(80)}`).expect(200);
        for (const query of [
          'pageSize=101',
          'pageSize=0',
          'page=0',
          'page=1001',
          `q=${'q'.repeat(81)}`,
          'page=abc',
        ])
          await api.get(`/admin/${list}?${query}`).expect(400);
      },
    );

    it.each(['products', 'orders', 'users'])(
      'searches the %s list as text: percent, underscore and backslash find what holds them, never a near miss, and SQL finds nothing',
      async (list) => {
        const { api } = await admin();
        const marker = randomUUID().slice(0, 8);
        // the near miss matches every character query only if it were read as a LIKE wildcard
        const names = {
          real: `Wild_card 100% back\\slash ${marker}`,
          near: `Wildxcard 100x backslash ${marker}`,
        };
        const users = await Promise.all(
          (['real', 'near'] as const).map((kind) =>
            prisma.user.create({
              data: { email: `search-${marker}-${kind}@test.example`, name: names[kind], passwordHash: 'x' },
            }),
          ),
        );
        const keys: Record<'real' | 'near', string> = { real: '', near: '' };
        if (list === 'users') [keys.real, keys.near] = users.map((u) => u.id);
        if (list === 'products') {
          const { id: categoryId } = await prisma.category.findUniqueOrThrow({
            where: { slug: 'accessories' },
          });
          for (const kind of ['real', 'near'] as const) {
            keys[kind] = `${TEMP}-search-${marker}-${kind}`;
            await prisma.product.create({
              data: {
                slug: keys[kind],
                name: names[kind],
                model: 'S-1',
                module: 'ACCESSORY',
                description: 'Created by the admin e2e suite',
                price: 10000,
                stock: 1,
                categoryId,
              },
            });
          }
        }
        if (list === 'orders') {
          for (const [i, kind] of (['real', 'near'] as const).entries()) {
            keys[kind] = `E2E-SEARCH-${marker}-${kind}`.toUpperCase();
            await prisma.order.create({
              data: {
                number: keys[kind],
                userId: users[i]!.id,
                status: 'CANCELLED',
                subtotal: 1000,
                shippingFee: 0,
                total: 1000,
                shippingZone: 'Sumatra',
                shipRecipient: names[kind],
                shipPhone: '+6281234567890',
                shipLine1: 'Jl. Sudirman No. 1',
                shipLine2: '',
                shipCity: 'Pekanbaru',
                shipProvince: 'Riau',
                shipPostalCode: '28111',
                idempotencyKey: randomUUID(),
                paymentExpiresAt: new Date(),
              },
            });
          }
        }
        const keyOf = (row: { slug?: string; number?: string; id?: string }) =>
          list === 'products' ? row.slug : list === 'orders' ? row.number : row.id;
        const found = async (q: string) =>
          (
            (await api.get(`/admin/${list}?pageSize=100&q=${encodeURIComponent(q)}`).expect(200)).body
              .items as object[]
          ).map(keyOf);
        try {
          for (const q of ['_', '%', '\\', 'wild_card', '100%', 'back\\slash']) {
            const keysFound = await found(q);
            expect([q, keysFound.includes(keys.real), keysFound.includes(keys.near)]).toEqual([
              q,
              true,
              false,
            ]);
          }
          expect(await found("' OR 1=1 --")).toEqual([]);
        } finally {
          await prisma.order.deleteMany({
            where: { number: { startsWith: `E2E-SEARCH-${marker.toUpperCase()}` } },
          });
          await prisma.product.deleteMany({ where: { slug: { startsWith: `${TEMP}-search-${marker}` } } });
          await prisma.user.deleteMany({ where: { email: { startsWith: `search-${marker}-` } } });
        }
      },
    );

    it('answers a database failure on a catalogue write with a bare 500, telling nothing', async () => {
      const { api } = await admin();
      const failures = [
        vi.spyOn(prisma.product, 'create').mockRejectedValueOnce(new Error('connection reset')),
        vi.spyOn(prisma.category, 'create').mockRejectedValueOnce(new Error('connection reset')),
        vi.spyOn(prisma.category, 'updateMany').mockRejectedValueOnce(new Error('connection reset')),
      ];
      const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const category = {
        slug: `e2e-cat-fail-${Date.now()}`,
        name: 'Fail',
        description: 'Fails',
        sortOrder: 1,
        slot: null,
      };
      try {
        const replies = [
          await api.post('/admin/products', { ...PRODUCT, slug: `${TEMP}-fail` }),
          await api.post('/admin/categories', category),
          await api.put('/admin/categories/accessories', {
            slug: 'accessories',
            name: 'Accessories',
            description: 'Unchanged',
            sortOrder: 1,
            slot: null,
          }),
        ];
        for (const res of replies)
          expect(res.body).toEqual({ statusCode: 500, message: 'Internal server error' });
      } finally {
        for (const f of failures) f.mockRestore();
        logged.mockRestore();
      }
      expect(await prisma.category.findUnique({ where: { slug: category.slug } })).toBeNull();
      expect(
        (await prisma.category.findUniqueOrThrow({ where: { slug: 'accessories' } })).description,
      ).not.toBe('Unchanged');
    });
  });
});
