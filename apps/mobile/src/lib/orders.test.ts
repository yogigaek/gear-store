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
