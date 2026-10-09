import type { INestApplication } from '@nestjs/common';
import { addressSchema, orderDetailSchema, type OrderDetail } from '@gear-store/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { loadEnv } from '../src/config/env.js';
import { MidtransError, type MidtransStatus, type SnapRequest } from '../src/payments/midtrans.client.js';
import { expectedSignature } from '../src/payments/signature.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, deleteTestUsers, FakeMail, nextIp, signedInCustomer } from './setup.js';

class FakeMidtrans {
  snapCalls: SnapRequest[] = [];
  down = false;
  status: MidtransStatus | null = null;
  createSnapTransaction(body: SnapRequest) {
    if (this.down) return Promise.reject(new MidtransError('Midtrans replied 503'));
    this.snapCalls.push(body);
    return Promise.resolve({
      token: 't',
      redirect_url: `https://app.sandbox.midtrans.com/snap/v4/redirection/${randomUUID()}`,
    });
  }
  getStatus() {
    return Promise.resolve(this.status);
  }
}

const SERVER_KEY = loadEnv().MIDTRANS_SERVER_KEY;

function signed(
  order: { number: string; total: number },
  transaction_status: string,
  extra: Partial<MidtransStatus> = {},
) {
  const base = {
    order_id: order.number,
    status_code: transaction_status === 'settlement' ? '200' : '201',
    gross_amount: `${order.total}.00`,
    transaction_status,
    transaction_id: randomUUID(),
    payment_type: 'bank_transfer',
    ...extra,
  };
  return { ...base, signature_key: expectedSignature(base, SERVER_KEY) };
}

describe('Payments (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const mail = new FakeMail();
  const midtrans = new FakeMidtrans();

  const notify = (body: object) =>
    request(app.getHttpServer()).post('/api/payments/midtrans/notification').send(body);

  async function placedOrder(slug = 'c-65-gan-charger', quantity = 1) {
    const token = await signedInCustomer(app, mail, nextIp());
    const auth = { Authorization: `Bearer ${token}` };
    const server = app.getHttpServer();
    const address = addressSchema.parse(
      (
        await request(server)
          .post('/api/me/addresses')
          .set(auth)
          .send({
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
    await request(server).put('/api/me/cart/items').set(auth).send({ slug, quantity }).expect(200);
    const order = orderDetailSchema.parse(
      (
        await request(server)
          .post('/api/me/orders')
          .set(auth)
          .send({ addressId: address.id, idempotencyKey: randomUUID() })
          .expect(201)
      ).body,
    );
    const as = {
      pay: () => request(server).post(`/api/me/orders/${order.number}/pay`).set(auth),
      get: async (): Promise<OrderDetail> =>
        orderDetailSchema.parse(
          (await request(server).get(`/api/me/orders/${order.number}`).set(auth).expect(200)).body,
        ),
      refresh: () => request(server).post(`/api/me/orders/${order.number}/payment-status`).set(auth),
      cancel: () => request(server).post(`/api/me/orders/${order.number}/cancel`).set(auth),
    };
    return { order, ...as };
  }

  beforeAll(async () => {
    app = await createTestApp({ mail, midtrans });
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await deleteTestUsers(app);
    await app.close();
  });

  beforeEach(() => {
    midtrans.down = false;
    midtrans.status = null;
  });

  describe('starting a payment', () => {
    it('sends the order’s own amounts to Midtrans and reuses the payment page', async () => {
      const o = await placedOrder('c-65-gan-charger', 2);
      const before = midtrans.snapCalls.length;
      const first = await o.pay().expect(200);
      const again = await o.pay().expect(200);
      expect(again.body.redirectUrl).toBe(first.body.redirectUrl);
      expect(midtrans.snapCalls.length).toBe(before + 1);

      const sent = midtrans.snapCalls.at(-1)!;
      expect(sent.transaction_details).toEqual({ order_id: o.order.number, gross_amount: o.order.total });
      const itemsTotal = sent.item_details.reduce((sum, i) => sum + i.price * i.quantity, 0);
      expect(itemsTotal).toBe(o.order.total);
      expect(sent.expiry.duration).toBeGreaterThan(55);
      expect(sent.callbacks.finish).toMatch(new RegExp(`/orders/${o.order.number}$`));
      await o.cancel().expect(200);
    });

    it('answers 503 when Midtrans is down, and 409 for an order no longer waiting', async () => {
      const o = await placedOrder();
      midtrans.down = true;
      await o.pay().expect(503);
      midtrans.down = false;
      await o.cancel().expect(200);
      await o.pay().expect(409);
    });
  });

  describe('notifications', () => {
    it('refuses a forged signature and changes nothing', async () => {
      const o = await placedOrder();
      const forged = { ...signed(o.order, 'settlement'), signature_key: 'f'.repeat(128) };
      await notify(forged).expect(401);
      await notify({ order_id: o.order.number }).expect(401);
      expect((await o.get()).status).toBe('PENDING_PAYMENT');
      const logged = await prisma.paymentNotification.findMany({ where: { orderNumber: o.order.number } });
      expect(logged.every((n) => !n.signatureValid)).toBe(true);
      await o.cancel().expect(200);
    });

    it('marks the order paid once, however many times Midtrans repeats it', async () => {
      const o = await placedOrder();
      const settlement = signed(o.order, 'settlement');
      expect((await notify(settlement).expect(200)).body.outcome).toBe('paid');
      expect((await notify(settlement).expect(200)).body.outcome).toBe('duplicate');
      const paid = await o.get();
      expect(paid.status).toBe('PAID');
      expect(paid.paidAt).not.toBeNull();
      expect(paid.events.filter((e) => e.status === 'PAID')).toHaveLength(1);
      expect(paid.payment?.method).toBe('bank_transfer');
      expect(paid.events.at(-1)?.note).toBe('Payment received via Bank transfer (virtual account).');
      await o.cancel().expect(409);
    });

    it('ignores a correctly signed notification whose amount differs from the order', async () => {
      const o = await placedOrder();
      const res = await notify(signed({ ...o.order, total: 1000 }, 'settlement')).expect(200);
      expect(res.body.outcome).toBe('amount-mismatch');
      expect((await o.get()).status).toBe('PENDING_PAYMENT');
      await o.cancel().expect(200);
    });

    it('does not accept a card capture that the fraud check challenged', async () => {
      const o = await placedOrder();
      await notify(signed(o.order, 'capture', { fraud_status: 'challenge' })).expect(200);
      expect((await o.get()).status).toBe('PENDING_PAYMENT');
      await notify(signed(o.order, 'capture', { fraud_status: 'accept' })).expect(200);
      expect((await o.get()).status).toBe('PAID');
    });

    it('closes the order and releases stock when the payment expires', async () => {
      const stock = async () =>
        (await prisma.product.findUniqueOrThrow({ where: { slug: 'p-20-power-bank' } })).stock;
      const before = await stock();
      const o = await placedOrder('p-20-power-bank', 2);
      expect(await stock()).toBe(before - 2);
      expect((await notify(signed(o.order, 'expire')).expect(200)).body.outcome).toBe('closed');
      expect((await o.get()).status).toBe('EXPIRED');
      expect(await stock()).toBe(before);
    });

    it('flags money that arrives after the order closed instead of reopening it', async () => {
      const o = await placedOrder();
      await o.cancel().expect(200);
      const late = signed(o.order, 'settlement');
      expect((await notify(late).expect(200)).body.outcome).toBe('paid-after-close');
      expect((await notify(late).expect(200)).body.outcome).toBe('duplicate');
      const order = await o.get();
      expect(order.status).toBe('CANCELLED');
      expect(order.events.at(-1)?.note).toMatch(/refunded/);
      expect(order.events.filter((e) => /refunded/.test(e.note))).toHaveLength(1);
    });

    it('acknowledges notifications for orders it does not know', async () => {
      const res = await notify(signed({ number: 'RKT-000000-ZZZZZZ', total: 1 }, 'settlement')).expect(200);
      expect(res.body.outcome).toBe('unknown-order');
    });
  });

  describe('checking status from the order page', () => {
    it('applies a signed status from Midtrans, and leaves the order alone when there is none', async () => {
      const o = await placedOrder();
      midtrans.status = null;
      expect(orderDetailSchema.parse((await o.refresh().expect(200)).body).status).toBe('PENDING_PAYMENT');
      midtrans.status = { ...signed(o.order, 'settlement'), signature_key: 'forged' };
      expect(orderDetailSchema.parse((await o.refresh().expect(200)).body).status).toBe('PENDING_PAYMENT');
      midtrans.status = signed(o.order, 'settlement');
      expect(orderDetailSchema.parse((await o.refresh().expect(200)).body).status).toBe('PAID');
    });
  });
});
