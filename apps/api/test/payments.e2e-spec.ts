import { Logger, type INestApplication } from '@nestjs/common';
import { addressSchema, orderDetailSchema, type OrderDetail } from '@gear-store/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { loadEnv } from '../src/config/env.js';
import { OrdersRepository } from '../src/orders/orders.repository.js';
import {
  MidtransClient,
  MidtransError,
  type MidtransStatus,
  type SnapRequest,
} from '../src/payments/midtrans.client.js';
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

    it('refuses to start a payment once the window has run out, even when the sweep could not close the order', async () => {
      const o = await placedOrder();
      await prisma.order.update({
        where: { number: o.order.number },
        data: { paymentExpiresAt: new Date(Date.now() - 1000) },
      });
      const sweep = vi
        .spyOn(app.get(OrdersRepository), 'closeOverdue')
        .mockRejectedValue(new Error('Transaction already closed'));
      const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const before = midtrans.snapCalls.length;
      try {
        await o.pay().expect(409);
        expect(midtrans.snapCalls.length).toBe(before);
      } finally {
        sweep.mockRestore();
        warn.mockRestore();
      }
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

    it('keeps the settlement on the payment record when a pending or expire notification arrives late', async () => {
      const o = await placedOrder();
      await notify(signed(o.order, 'pending')).expect(200);
      expect((await o.get()).payment).toMatchObject({ status: 'pending', method: 'bank_transfer' });
      expect((await notify(signed(o.order, 'settlement')).expect(200)).body.outcome).toBe('paid');
      expect((await notify(signed(o.order, 'pending')).expect(200)).body.outcome).toBe('pending');
      expect((await notify(signed(o.order, 'expire')).expect(200)).body.outcome).toBe('duplicate');
      const paid = await o.get();
      expect(paid.status).toBe('PAID');
      expect(paid.payment?.status).toBe('settlement');
    });

    it('records money that arrived after the order closed, for its refund, and nothing later undoes it', async () => {
      const o = await placedOrder();
      await o.cancel().expect(200);
      expect((await notify(signed(o.order, 'settlement')).expect(200)).body.outcome).toBe('paid-after-close');
      expect((await notify(signed(o.order, 'expire')).expect(200)).body.outcome).toBe('duplicate');
      expect((await o.get()).payment?.status).toBe('settlement');
    });

    it('records a refund or chargeback of a paid order on its payment, and a late pending does not undo it', async () => {
      const paid = await placedOrder();
      await notify(signed(paid.order, 'settlement')).expect(200);
      expect((await notify(signed(paid.order, 'refund')).expect(200)).body.outcome).toBe('ignored');
      await notify(signed(paid.order, 'pending')).expect(200);
      expect(await paid.get()).toMatchObject({ status: 'PAID', payment: { status: 'refund' } });

      const late = await placedOrder();
      await late.cancel().expect(200);
      await notify(signed(late.order, 'settlement')).expect(200);
      await notify(signed(late.order, 'chargeback')).expect(200);
      expect(await late.get()).toMatchObject({ status: 'CANCELLED', payment: { status: 'chargeback' } });
    });

    it('never lets a payment and the expiry both win an order whose time runs out as the money arrives', async () => {
      const stock = async () =>
        (await prisma.product.findUniqueOrThrow({ where: { slug: 'battery-charger-4a' } })).stock;
      const o = await placedOrder();
      const held = await stock();
      await prisma.order.update({
        where: { number: o.order.number },
        data: { paymentExpiresAt: new Date(Date.now() - 1000) },
      });
      // reading the order sweeps it out while the notification is applied
      const [, paid] = await Promise.all([o.get(), notify(signed(o.order, 'settlement')).expect(200)]);
      const order = await prisma.order.findUniqueOrThrow({ where: { number: o.order.number } });
      if (paid.body.outcome === 'paid') {
        expect([order.status, order.refundStatus, await stock()]).toEqual(['PAID', 'NONE', held]);
      } else {
        expect(paid.body.outcome).toBe('paid-after-close');
        expect([order.status, order.refundStatus, await stock()]).toEqual(['EXPIRED', 'NEEDED', held + 1]);
      }
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

  describe('edge cases', () => {
    const stockOf = async (slug: string) =>
      (await prisma.product.findUniqueOrThrow({ where: { slug }, select: { stock: true } })).stock;

    it.each(['cancel', 'deny', 'failure'])(
      'closes the order as cancelled on a "%s" notification, gives the stock back once, and records it once',
      async (transactionStatus) => {
        const before = await stockOf('lights-front-rear');
        const o = await placedOrder('lights-front-rear', 1);
        const message = signed(o.order, transactionStatus);
        expect((await notify(message).expect(200)).body.outcome).toBe('closed');
        expect((await notify(message).expect(200)).body.outcome).toBe('duplicate');
        const order = await o.get();
        expect(order.status).toBe('CANCELLED');
        expect(order.events.at(-1)?.note).toBe('The payment was declined or cancelled.');
        expect(order.payment?.status).toBe(transactionStatus);
        expect(await stockOf('lights-front-rear')).toBe(before);
      },
    );

    it('notes a payment without a method as simply received', async () => {
      const o = await placedOrder();
      expect(
        (await notify(signed(o.order, 'settlement', { payment_type: undefined })).expect(200)).body.outcome,
      ).toBe('paid');
      const paid = await o.get();
      expect(paid.events.at(-1)?.note).toBe('Payment received.');
      expect(paid.payment).toMatchObject({ status: 'settlement', method: null });
    });

    it('treats an amount that is not a number as a mismatch, even correctly signed', async () => {
      const o = await placedOrder();
      for (const gross_amount of ['NaN', 'Infinity', '1e999', ''])
        expect((await notify(signed(o.order, 'settlement', { gross_amount })).expect(200)).body.outcome).toBe(
          'amount-mismatch',
        );
      expect((await o.get()).status).toBe('PENDING_PAYMENT');
      await o.cancel().expect(200);
    });

    it('refuses a notification that is not a JSON object, and stores nothing', async () => {
      const before = await prisma.paymentNotification.count();
      const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const server = app.getHttpServer();
      const raw = (type: string, body: string) =>
        request(server).post('/api/payments/midtrans/notification').set('Content-Type', type).send(body);
      try {
        const statuses = [
          await raw('application/json', '[]'),
          await raw(
            'application/x-www-form-urlencoded',
            'order_id=RKT-000000-ZZZZZZ&transaction_status=settlement',
          ),
          await notify({
            ...signed({ number: 'RKT-000000-ZZZZZZ', total: 1 }, 'settlement'),
            gross_amount: 1,
          }),
          // the JSON parser itself refuses a bare value and broken JSON
          await raw('application/json', '"settlement"'),
          await raw('application/json', 'null'),
          await raw('application/json', '{"order_id": '),
        ].map((r) => r.status);
        expect(statuses).toEqual([401, 401, 401, 400, 400, 400]);
      } finally {
        warn.mockRestore();
      }
      expect(await prisma.paymentNotification.count()).toBe(before);
    });

    it('names a part with its finish for Midtrans, within its 50 characters', async () => {
      const o = await placedOrder('e1-frame-m');
      await o.pay().expect(200);
      const sent = midtrans.snapCalls.at(-1)!;
      expect(sent.item_details[0]!.name).toMatch(/ \(Signal yellow\)$/);
      for (const item of sent.item_details) {
        expect(item.name.length).toBeLessThanOrEqual(50);
        expect(item.id.length).toBeLessThanOrEqual(50);
      }
      await o.cancel().expect(200);
    });

    it('gives two "Pay now" clicks at once one payment page', async () => {
      const o = await placedOrder();
      let arrived = 0;
      let bothIn: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => {
        bothIn = resolve;
      });
      // each click waits until the other has also asked Midtrans, so both reach the insert
      const create = vi.spyOn(midtrans, 'createSnapTransaction').mockImplementation(async () => {
        arrived += 1;
        if (arrived === 2) bothIn();
        await Promise.race([gate, new Promise((r) => setTimeout(r, 3000))]);
        return {
          token: 't',
          redirect_url: `https://app.sandbox.midtrans.com/snap/v4/redirection/${randomUUID()}`,
        };
      });
      try {
        const [a, b] = await Promise.all([o.pay(), o.pay()]);
        expect([a.status, b.status]).toEqual([200, 200]);
        expect(arrived).toBe(2);
        expect(a.body.redirectUrl).toBe(b.body.redirectUrl);
      } finally {
        create.mockRestore();
      }
      const saved = await prisma.payment.findMany({ where: { order: { number: o.order.number } } });
      expect(saved.map((p) => p.redirectUrl)).toEqual([(await o.pay().expect(200)).body.redirectUrl]);
      await o.cancel().expect(200);
    });

    it('answers a failure to save the payment page with a bare 500, and asks Midtrans again on the next click', async () => {
      const o = await placedOrder();
      const before = midtrans.snapCalls.length;
      const save = vi.spyOn(prisma.payment, 'create').mockRejectedValueOnce(new Error('connection reset'));
      const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      try {
        expect((await o.pay().expect(500)).body).toEqual({
          statusCode: 500,
          message: 'Internal server error',
        });
      } finally {
        save.mockRestore();
        logged.mockRestore();
      }
      const { redirectUrl } = (await o.pay().expect(200)).body as { redirectUrl: string };
      expect(midtrans.snapCalls.length).toBe(before + 2);
      expect((await o.get()).payment?.redirectUrl).toBe(redirectUrl);
      await o.cancel().expect(200);
    });

    it('keeps the payment page when a notification recorded the payment before the first click', async () => {
      const o = await placedOrder();
      expect((await notify(signed(o.order, 'pending')).expect(200)).body.outcome).toBe('pending');
      const before = midtrans.snapCalls.length;
      const first = (await o.pay().expect(200)).body as { redirectUrl: string };
      const again = (await o.pay().expect(200)).body as { redirectUrl: string };
      expect(again.redirectUrl).toBe(first.redirectUrl);
      // Midtrans refuses a second transaction for one order_id, so it must be asked once
      expect(midtrans.snapCalls.length).toBe(before + 1);
      await o.cancel().expect(200);
    });

    it('answers 503 PAYMENTS_UNAVAILABLE, saving no link, when Midtrans hands back a payment page that is not https', async () => {
      const o = await placedOrder();
      // the real client parses the reply; only the network answer is faked
      const real = new MidtransClient(loadEnv());
      const create = vi
        .spyOn(midtrans, 'createSnapTransaction')
        .mockImplementation((body) => real.createSnapTransaction(body));
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ token: 't', redirect_url: 'http://app.sandbox.midtrans.com/x' }), {
            status: 201,
          }),
        ),
      );
      const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      try {
        expect((await o.pay().expect(503)).body).toMatchObject({ code: 'PAYMENTS_UNAVAILABLE' });
      } finally {
        create.mockRestore();
        vi.unstubAllGlobals();
        logged.mockRestore();
      }
      expect((await o.get()).payment).toBeNull();
      await o.cancel().expect(200);
    });

    it('answers a status check that fails unexpectedly with a bare 500, and leaves the order as it was', async () => {
      const o = await placedOrder();
      const getStatus = vi.spyOn(midtrans, 'getStatus').mockRejectedValueOnce(new TypeError('boom'));
      const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      try {
        const res = await o.refresh().expect(500);
        expect(res.body).toEqual({ statusCode: 500, message: 'Internal server error' });
      } finally {
        getStatus.mockRestore();
        logged.mockRestore();
      }
      expect((await o.get()).status).toBe('PENDING_PAYMENT');
      await o.cancel().expect(200);
    });

    it('refuses to start or check a payment without a token, or for a malformed order number', async () => {
      const server = app.getHttpServer();
      await request(server).post('/api/me/orders/RKT-261101-ABCDEF/pay').expect(401);
      await request(server).post('/api/me/orders/RKT-261101-ABCDEF/payment-status').expect(401);
      const auth = { Authorization: `Bearer ${await signedInCustomer(app, mail, nextIp())}` };
      await request(server)
        .post(`/api/me/orders/${encodeURIComponent("RKT' OR 1=1")}/pay`)
        .set(auth)
        .expect(400);
      await request(server).post('/api/me/orders/RKT-261101-ABCDEF/pay').set(auth).expect(404);
    });
  });
});
