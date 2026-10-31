import { Logger, type INestApplication } from '@nestjs/common';
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
  /** Midtrans refusing the server key, as it does while the key is the .env placeholder */
  keyRefused = false;
  status: MidtransStatus | null = null;
  createSnapTransaction(body: SnapRequest) {
    if (this.keyRefused) return Promise.reject(new MidtransError('Midtrans replied 401', 401));
    if (this.down) return Promise.reject(new MidtransError('Midtrans replied 503'));
    this.snapCalls.push(body);
    return Promise.resolve({
      token: 't',
      redirect_url: `https://app.sandbox.midtrans.com/snap/v4/redirection/${randomUUID()}`,
    });
  }
  getStatus() {
    if (this.keyRefused) return Promise.reject(new MidtransError('Midtrans replied 401', 401));
    if (this.down) return Promise.reject(new MidtransError('Midtrans replied 503'));
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

  async function placedOrder(slug = 'battery-charger-4a', quantity = 1) {
    const token = await signedInCustomer(app, mail, nextIp());
    // one IP address per customer, so the suite's many checkouts stay under the 10-a-minute order throttle
    const auth = { Authorization: `Bearer ${token}`, 'X-Forwarded-For': nextIp() };
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
      const o = await placedOrder('battery-charger-4a', 2);
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
      expect(sent.callbacks.finish).toMatch(/\/payment-done$/);
      await o.cancel().expect(200);
    });

    it('answers 503 when Midtrans is down, and 409 for an order no longer waiting', async () => {
      const o = await placedOrder();
      midtrans.down = true;
      // the code lets the store show these words: a server failure's own are otherwise hidden
      expect((await o.pay().expect(503)).body).toMatchObject({ code: 'PAYMENTS_UNAVAILABLE' });
      expect((await o.refresh().expect(503)).body).toMatchObject({ code: 'PAYMENTS_UNAVAILABLE' });
      midtrans.down = false;
      await o.cancel().expect(200);
      await o.pay().expect(409);
    });

    it('says payments are not set up when Midtrans refuses the key, and still shows the order', async () => {
      const o = await placedOrder();
      midtrans.keyRefused = true;
      const res = await o.pay().expect(503);
      expect(res.body).toMatchObject({ code: 'PAYMENTS_NOT_SET_UP' });
      // the order page's status check is not an error: nothing can have been paid
      expect(orderDetailSchema.parse((await o.refresh().expect(200)).body).status).toBe('PENDING_PAYMENT');
      midtrans.keyRefused = false;
      await o.cancel().expect(200);
    });
  });

  describe('notifications', () => {
    it('refuses a forged signature and changes nothing', async () => {
      const o = await placedOrder();
      const forged = { ...signed(o.order, 'settlement'), signature_key: 'f'.repeat(128) };
      await notify(forged).expect(401);
      await notify({ order_id: o.order.number }).expect(401);
      expect((await o.get()).status).toBe('PENDING_PAYMENT');
      // anyone can send these: nothing is written, so they cannot fill the database
      expect(await prisma.paymentNotification.count({ where: { orderNumber: o.order.number } })).toBe(0);
      await o.cancel().expect(200);
    });

    it('stores no forged or malformed call, and logs only a short, cleaned order id', async () => {
      const before = await prisma.paymentNotification.count();
      const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      try {
        const junk = `RKT-${'X'.repeat(30)}\n[forged] ${'Y'.repeat(5000)}`;
        await notify({
          ...signed({ number: 'RKT-000000-ZZZZZZ', total: 1 }, 'settlement'),
          order_id: junk,
        }).expect(401);
        await notify({ order_id: junk, padding: 'Z'.repeat(20_000) }).expect(401);
        await notify({ order_id: 42 }).expect(401);
        const forged = {
          ...signed({ number: 'RKT-000000-ZZZZZZ', total: 1 }, 'settlement'),
          signature_key: 'f',
        };
        await notify(forged).expect(401);
        expect(await prisma.paymentNotification.count()).toBe(before);
        const lines = warn.mock.calls.map((c) => String(c[0]));
        expect(lines).toHaveLength(4);
        expect(lines.at(-1)).toBe('Rejected a notification with a bad signature for RKT-000000-ZZZZZZ');
        for (const line of lines) {
          expect(line.length).toBeLessThan(120);
          expect(line).not.toMatch(/[\n[\]]|Y{51}|Z{51}/);
        }
      } finally {
        warn.mockRestore();
      }
    });

    it('refuses an order_id longer than Midtrans allows, even correctly signed', async () => {
      const tooLong = signed({ number: `RKT-${'1'.repeat(47)}`, total: 1 }, 'settlement');
      await notify(tooLong).expect(401);
      const longest = signed({ number: `RKT-${'1'.repeat(46)}`, total: 1 }, 'settlement');
      expect((await notify(longest).expect(200)).body.outcome).toBe('unknown-order');
    });

    it('records every correctly signed notification in full, as before', async () => {
      const o = await placedOrder();
      const pending = signed(o.order, 'pending');
      const settlement = signed(o.order, 'settlement');
      await notify(pending).expect(200);
      await notify(settlement).expect(200);
      const logged = await prisma.paymentNotification.findMany({
        where: { orderNumber: o.order.number },
        orderBy: { receivedAt: 'asc' },
      });
      expect(logged.map((n) => [n.signatureValid, n.outcome, n.transactionStatus])).toEqual([
        [true, 'pending', 'pending'],
        [true, 'paid', 'settlement'],
      ]);
      expect(logged[1]!.payload).toEqual(settlement);
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
        (await prisma.product.findUniqueOrThrow({ where: { slug: 'lights-front-rear' } })).stock;
      const before = await stock();
      const o = await placedOrder('lights-front-rear', 2);
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

    it('flags a late payment for a demo order that a newer demo order replaced', async () => {
      const auth = {
        Authorization: `Bearer ${await signedInCustomer(app, mail, nextIp())}`,
        'X-Forwarded-For': nextIp(),
      };
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
      const { userId } = await prisma.address.findUniqueOrThrow({
        where: { id: address.id },
        select: { userId: true },
      });
      await prisma.user.update({ where: { id: userId }, data: { isDemo: true } });
      const buy = async () =>
        orderDetailSchema.parse(
          (
            await request(server)
              .post('/api/me/orders')
              .set(auth)
              .send({
                addressId: address.id,
                idempotencyKey: randomUUID(),
                items: [{ slug: 'battery-charger-4a', quantity: 1 }],
              })
              .expect(201)
          ).body,
        );
      const replaced = await buy();
      const newer = await buy();
      const late = signed(replaced, 'settlement');
      expect((await notify(late).expect(200)).body.outcome).toBe('paid-after-close');
      const row = await prisma.order.findUniqueOrThrow({ where: { number: replaced.number } });
      expect(row).toMatchObject({ status: 'CANCELLED', refundStatus: 'NEEDED' });
      await request(server).post(`/api/me/orders/${newer.number}/cancel`).set(auth).expect(200);
    });

    it('acknowledges notifications for orders it does not know', async () => {
      const res = await notify(signed({ number: 'RKT-000000-ZZZZZZ', total: 1 }, 'settlement')).expect(200);
      expect(res.body.outcome).toBe('unknown-order');
    });
  });

  describe('another account’s order', () => {
    it('cannot be paid for or have its status checked: 404, and Midtrans is never asked', async () => {
      const o = await placedOrder();
      const stranger = { Authorization: `Bearer ${await signedInCustomer(app, mail, nextIp())}` };
      const server = app.getHttpServer();
      const snaps = midtrans.snapCalls.length;
      midtrans.status = signed(o.order, 'settlement');
      const getStatus = vi.spyOn(midtrans, 'getStatus');
      try {
        for (const action of ['pay', 'payment-status']) {
          const res = await request(server).post(`/api/me/orders/${o.order.number}/${action}`).set(stranger);
          expect(res.status).toBe(404);
          expect(res.body.message).toBe('Order not found');
        }
        expect(getStatus).not.toHaveBeenCalled();
      } finally {
        getStatus.mockRestore();
      }
      expect(midtrans.snapCalls.length).toBe(snaps);
      expect((await o.get()).status).toBe('PENDING_PAYMENT');
      await o.cancel().expect(200);
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
