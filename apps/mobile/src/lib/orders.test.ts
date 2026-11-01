import type { OrderDetail } from '@gear-store/shared';
import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { colors } from '../theme';
import { createServer, deferred, USERS, type FakeServer } from '../test/fake-api';
import { resetFakes } from '../test/fakes';

let server: FakeServer;

async function launch() {
  vi.resetModules();
  const auth = await import('./auth');
  const orders = await import('./orders');
  await auth.auth.signIn({ email: USERS.a.email, password: 'secret-password' });
  return { ...auth, ...orders, queryClient: new QueryClient() };
}

// showOrder only stores what it is given, so a stand-in with the fields it reads is enough
const order = (status: OrderDetail['status']) => ({ number: 'RK-0001', status }) as OrderDetail;

beforeEach(() => {
  resetFakes();
  server = createServer();
  globalThis.fetch = ((url: string, init?: RequestInit) => server.fetch(url, init)) as typeof fetch;
});

describe('showOrder', () => {
  it('is not overwritten by a read of the order that was already on its way', async () => {
    const m = await launch();
    const key = m.orderKey(USERS.a.id, 'RK-0001');
    const hold = deferred();
    void m.queryClient
      .query({ queryKey: key, queryFn: () => hold.wait.then(() => order('PENDING_PAYMENT')) })
      .catch(() => undefined);
    await m.showOrder(m.queryClient, USERS.a.id, order('PAID'));
    hold.resolve();
    await new Promise((r) => setTimeout(r, 10));
    expect(m.queryClient.getQueryData(key)).toMatchObject({ status: 'PAID' });
  });

  it('does nothing at all once that account has signed out: no write, and a read on its way is left alone', async () => {
    const m = await launch();
    const key = m.orderKey(USERS.a.id, 'RK-0001');
    const hold = deferred();
    const read = m.queryClient.query({
      queryKey: key,
      queryFn: () => hold.wait.then(() => order('EXPIRED')),
    });
    await m.auth.signOut();
    await m.showOrder(m.queryClient, USERS.a.id, order('PAID'));
    hold.resolve();
    await expect(read).resolves.toMatchObject({ status: 'EXPIRED' });
    expect(m.queryClient.getQueryData(key)).toMatchObject({ status: 'EXPIRED' });
  });

  it('does not show an order for an account that signed out while an earlier read was being cancelled', async () => {
    const m = await launch();
    const key = m.orderKey(USERS.a.id, 'RK-0001');
    void m.queryClient
      .query({ queryKey: key, queryFn: () => new Promise<OrderDetail>(() => undefined) })
      .catch(() => undefined);
    const showing = m.showOrder(m.queryClient, USERS.a.id, order('PAID'));
    void m.auth.signOut();
    await showing;
    expect(m.queryClient.getQueryData(key)).toBeUndefined();
  });
});

describe('statusColors', () => {
  it('marks waiting in signal, paid onwards as good, and orders closed unpaid as muted', async () => {
    const { statusColors } = await import('./orders');
    expect(statusColors).toEqual({
      PENDING_PAYMENT: colors.signal,
      PAID: colors.ok,
      SHIPPED: colors.ok,
      DELIVERED: colors.ok,
      CANCELLED: colors.ink3,
      EXPIRED: colors.ink3,
    });
  });
});

describe('formatDateTime', () => {
  it('gives the time in Jakarta and says so, wherever the phone is', async () => {
    const { formatDateTime } = await import('./orders');
    expect(formatDateTime('2026-10-27T07:05:00.000Z')).toBe('27 Oct 2026, 14:05 WIB');
    expect(formatDateTime('2026-10-27T17:30:00.000Z')).toBe('28 Oct 2026, 00:30 WIB');
  });
});

describe('expiryDelay', () => {
  const now = Date.parse('2026-10-27T07:00:00.000Z');

  it('waits until the payment window ends, and a moment more for the API to close the order', async () => {
    const { expiryDelay } = await import('./orders');
    expect(expiryDelay('2026-10-27T07:30:00.000Z', now)).toBe(30 * 60_000 + 2_000);
  });

  it('re-reads at once (after the same moment) for a window that has already ended', async () => {
    const { expiryDelay } = await import('./orders');
    expect(expiryDelay('2026-10-27T06:00:00.000Z', now)).toBe(2_000);
  });

  it('never asks for a timer longer than setTimeout can hold, and none for a date it cannot read', async () => {
    const { expiryDelay } = await import('./orders');
    expect(expiryDelay('2027-12-31T00:00:00.000Z', now)).toBe(2_147_483_647);
    expect(expiryDelay('not a date', now)).toBeNull();
  });
});

describe('order calls', () => {
  const NUMBER = 'RKT-261031-ABCD29';
  const detail = (status: OrderDetail['status']) => ({
    number: NUMBER,
    status,
    subtotal: 0,
    shippingFee: 0,
    total: 0,
    shipping: {
      recipient: 'A',
      phone: 'p',
      line1: 'l',
      line2: '',
      city: 'c',
      province: 'Bali',
      postalCode: '80111',
      zone: 'B',
    },
    items: [],
    builds: [],
    events: [],
    createdAt: 'x',
    paymentExpiresAt: 'x',
    paidAt: null,
    payment: null,
    canPay: status === 'PENDING_PAYMENT',
    canCancel: status === 'PENDING_PAYMENT',
    fulfilment: { courier: null, trackingNumber: null, shippedAt: null, deliveredAt: null },
    refundStatus: 'NONE',
  });
  const address = {
    id: crypto.randomUUID(),
    label: '',
    recipient: 'Ana',
    phone: '+6281234567890',
    line1: 'Jl. Sudirman 1',
    line2: '',
    city: 'Denpasar',
    province: 'Bali' as const,
    postalCode: '80111',
    isDefault: true,
    shippingFee: 22000,
    shippingEta: '2–3 days',
  };
  const reply = (body: unknown) => ({ reply: { status: 200, body } });

  it('hands the address just saved to checkout once', async () => {
    const m = await launch();
    expect(m.orders.takeAddedAddress()).toBeNull();
    server.gate('/me/addresses', reply(address));
    const { id, shippingFee: _, shippingEta: __, ...input } = address;
    await m.orders.createAddress(input);
    expect(server.calls('/me/addresses')[0]).toMatchObject({ method: 'POST', userId: USERS.a.id });
    expect(m.orders.takeAddedAddress()).toBe(id);
    expect(m.orders.takeAddedAddress()).toBeNull();
  });

  it('remembers no address the API refused', async () => {
    const m = await launch();
    server.gate('/me/addresses', { reply: { status: 400, body: { message: 'Enter the street address' } } });
    const { id: _, shippingFee: __, shippingEta: ___, ...input } = address;
    await expect(m.orders.createAddress(input)).rejects.toMatchObject({ status: 400 });
    expect(m.orders.takeAddedAddress()).toBeNull();
  });

  it('places the cart with its key, or exactly the Buy now lines', async () => {
    const m = await launch();
    const key = crypto.randomUUID();
    server.gate('/me/orders', reply(detail('PENDING_PAYMENT')));
    server.gate('/me/orders', reply(detail('PENDING_PAYMENT')));
    await m.orders.place(address.id, key);
    const items = [{ slug: 'folding-lock', colorKey: '', quantity: 10 }];
    await m.orders.place(address.id, key, items);
    expect(server.calls('/me/orders').map((c) => c.body)).toEqual([
      { addressId: address.id, idempotencyKey: key },
      { addressId: address.id, idempotencyKey: key, items },
    ]);
  });

  it('reads, pulls and cancels an order by its encoded number', async () => {
    const m = await launch();
    const path = `/me/orders/${NUMBER}`;
    server.gate(path, reply(detail('PENDING_PAYMENT')));
    server.gate(`${path}/payment-status`, reply(detail('PAID')));
    server.gate(`${path}/cancel`, reply(detail('CANCELLED')));
    expect((await m.orders.get(NUMBER)).status).toBe('PENDING_PAYMENT');
    expect((await m.orders.pullPayment(NUMBER)).status).toBe('PAID');
    expect((await m.orders.cancel(NUMBER)).status).toBe('CANCELLED');
    await expect(m.orders.get('../addresses')).rejects.toMatchObject({ status: 404 });
    expect(server.log.at(-1)!.path).toBe('/me/orders/..%2Faddresses');
  });

  it('opens only an https payment page', async () => {
    const m = await launch();
    const path = `/me/orders/${NUMBER}/pay`;
    server.gate(path, reply({ redirectUrl: 'https://app.sandbox.midtrans.com/snap/v4/x' }));
    expect(await m.orders.paymentPage(NUMBER)).toEqual({
      redirectUrl: 'https://app.sandbox.midtrans.com/snap/v4/x',
    });
    for (const redirectUrl of [
      'javascript:alert(1)',
      'http://app.midtrans.com/x',
      'intent://evil#Intent;end',
    ]) {
      server.gate(path, reply({ redirectUrl }));
      await expect(m.orders.paymentPage(NUMBER), redirectUrl).rejects.toMatchObject({ status: 502 });
    }
  });

  it('refuses every call once signed out', async () => {
    const m = await launch();
    await m.auth.signOut();
    await expect(m.orders.get(NUMBER)).rejects.toMatchObject({ status: 401 });
    expect(server.calls(`/me/orders/${NUMBER}`)).toHaveLength(0);
  });
});
