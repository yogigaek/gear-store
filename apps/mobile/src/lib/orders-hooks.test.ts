import { beforeEach, describe, expect, it, vi } from 'vitest';
import { retryTransient } from './api';

// the hooks' useQuery and session stood in for: each hook is read for what it asks of TanStack Query
const stub = vi.hoisted(() => ({
  queries: [] as Record<string, any>[],
  state: { status: 'signed-out' } as { status: string; user?: { id: string } },
  sent: [] as string[],
}));
vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: Record<string, any>) => stub.queries.push(options),
}));
vi.mock('./auth', () => ({
  useAuth: () => stub.state,
  currentUserId: () => stub.state.user?.id ?? null,
  authedApi: async (path: string) => {
    stub.sent.push(path);
    return path;
  },
}));

const { useAddresses: addresses, useOrder: oneOrder, useOrders: orderList } = await import('./orders');

beforeEach(() => {
  stub.queries = [];
  stub.sent = [];
});

describe('order hooks', () => {
  it('ask nothing while signed out, under no account’s key', () => {
    stub.state = { status: 'signed-out' };
    addresses();
    orderList();
    oneOrder('RKT-261031-ABCD29', true);
    expect(stub.queries.map((q) => [q.enabled, q.queryKey[1]])).toEqual([
      [false, ''],
      [false, ''],
      [false, ''],
    ]);
  });

  it('read the signed-in account’s addresses, orders and order under its own keys', async () => {
    stub.state = { status: 'signed-in', user: { id: 'u1' } };
    addresses();
    orderList();
    oneOrder('RKT-261031-ABCD29', false);
    expect(stub.queries.map((q) => q.queryKey)).toEqual([
      ['me', 'u1', 'addresses'],
      ['me', 'u1', 'orders'],
      ['me', 'u1', 'order', 'RKT-261031-ABCD29'],
    ]);
    expect(stub.queries.every((q) => q.enabled)).toBe(true);
    expect(stub.queries.slice(1).every((q) => q.retry === retryTransient)).toBe(true);
    for (const q of stub.queries) await q.queryFn();
    expect(stub.sent).toEqual(['/me/addresses', '/me/orders', '/me/orders/RKT-261031-ABCD29']);
  });

  it.each([
    [true, true, true, 8000],
    [true, true, false, false],
    [true, false, true, false],
    [false, true, true, false],
  ])(
    'watching %s, payable %s, payment opened %s: re-reads every %s (ms)',
    (watching, canPay, opened, every) => {
      stub.state = { status: 'signed-in', user: { id: 'u1' } };
      oneOrder('RKT-261031-ABCD29', watching);
      const data = {
        canPay,
        payment: opened ? { redirectUrl: 'https://x', status: null, method: null } : null,
      };
      expect(stub.queries[0]!.refetchInterval({ state: { data } })).toBe(every);
      expect(stub.queries[0]!.refetchInterval({ state: { data: undefined } })).toBe(false);
    },
  );
});
