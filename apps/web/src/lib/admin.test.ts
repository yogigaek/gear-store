import { keepPreviousData } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { order } from '../test/fixtures';
import { auth, call, fakeApi, fetchQuery, hooks, query, resetHooks } from '../test/query-hooks';
import {
  useAdminCategories,
  useAdminOrder,
  useAdminOrderActions,
  useAdminOrders,
  useAdminProduct,
  useAdminProducts,
  useAdminStats,
  useAdminUsers,
  useCreateCategory,
  useCreateProduct,
  useDeleteCategory,
  useSaveCategory,
  useSetRole,
  useUpdateProduct,
} from './admin';

vi.mock('@tanstack/react-query', async (actual) =>
  (await import('../test/query-hooks')).mockReactQuery(
    await actual<typeof import('@tanstack/react-query')>(),
  ),
);
vi.mock('./auth-context', async () => {
  const { auth } = await import('../test/query-hooks');
  return { useAuth: () => auth };
});

const adminOrder = {
  ...order({ status: 'PAID', canPay: false }),
  customer: { name: 'Ana', email: 'a@b.co' },
};
const category = { slug: 'frames', name: 'Frames', description: 'Fr', sortOrder: 0, slot: 0 };
const product = {
  slug: 'x-1',
  name: 'X',
  model: 'X-1',
  category: 'frames',
  module: 'FRAME' as const,
  description: 'A test part.',
  price: 1000,
  stock: 1,
  isActive: true,
  specs: [],
  colors: [],
  updatedAt: '2026-10-31T00:00:00.000Z',
};
const page = (items: unknown[]) => ({ items, page: 1, pageSize: 20, total: items.length });
const paths = () => hooks.queries.map((q) => q.queryKey[1]);

beforeEach(resetHooks);
afterEach(() => vi.unstubAllGlobals());

describe('admin reads', () => {
  it('keys each list by its path, leaving out empty filters', () => {
    call(useAdminStats, 7);
    call(useAdminOrders, { status: '', refund: undefined, q: '', page: 1 });
    call(useAdminOrders, { status: 'PAID', refund: 'needed', q: 'ana & co', page: 3 });
    call(useAdminProducts, { q: 'fork', page: 2 });
    call(useAdminUsers, { page: 1 });
    call(useAdminCategories);
    expect(paths()).toEqual([
      '/stats?days=7',
      '/orders?page=1',
      '/orders?status=PAID&refund=needed&q=ana+%26+co&page=3',
      '/products?q=fork&page=2',
      '/users?page=1',
      '/categories',
    ]);
    for (const q of hooks.queries) {
      expect(q.queryKey[0]).toBe('admin');
      expect(q.placeholderData).toBe(keepPreviousData);
    }
  });

  it('reads nothing until signed in', () => {
    auth.status = 'restoring';
    call(useAdminOrder, 'RKT-261031-ABCD29');
    expect(query('admin').enabled).toBe(false);
  });

  it('reads with the token and checks the reply', async () => {
    const sent = fakeApi({
      'GET /admin/orders/RKT-261031-ABCD29': () => adminOrder,
      'GET /admin/products/x-1': () => product,
      'GET /admin/users?q=a&page=1': () => page([{ ...adminOrder }]),
    });
    call(useAdminOrder, 'RKT-261031-ABCD29');
    call(useAdminProduct, 'x-1');
    call(useAdminUsers, { q: 'a', page: 1 });
    expect(await fetchQuery(query('admin', '/orders/RKT-261031-ABCD29'))).toMatchObject({ status: 'PAID' });
    expect(await fetchQuery(query('admin', '/products/x-1'))).toMatchObject({ slug: 'x-1' });
    // a user row without its fields is a contract break, not a page of users
    await expect(fetchQuery(query('admin', '/users?q=a&page=1'))).rejects.toThrow();
    expect(sent.every((s) => s.auth === 'Bearer t')).toBe(true);
  });
});

describe('admin changes', () => {
  it('sends each change with its method, path and body, then refetches every admin list', async () => {
    const sent = fakeApi({
      'POST /admin/products': () => product,
      'PUT /admin/products/x-1': () => product,
      'PUT /admin/categories/frames': () => ({ ...category, productCount: 0, activeCount: 0 }),
      'POST /admin/categories': () => ({ ...category, productCount: 0, activeCount: 0 }),
      'DELETE /admin/categories/frames': () => undefined,
      'PATCH /admin/users/u1/role': () => ({
        id: crypto.randomUUID(),
        email: 'a@b.co',
        name: 'A',
        role: 'ADMIN',
        emailVerified: true,
        isDemo: false,
        orderCount: 0,
        createdAt: 'x',
      }),
    });
    const invalidate = vi.spyOn(hooks.client, 'invalidateQueries');
    const { updatedAt: _, ...input } = product;
    await call(useCreateProduct).mutateAsync({ ...input, specs: [], colors: [] });
    await call(useUpdateProduct, 'x-1').mutateAsync({ ...input, expectedUpdatedAt: product.updatedAt });
    await call(useSaveCategory).mutateAsync({ slug: 'frames', input: category });
    await call(useCreateCategory).mutateAsync(category);
    await call(useDeleteCategory).mutateAsync('frames');
    await call(useSetRole).mutateAsync({ id: 'u1', role: 'ADMIN' });
    expect(sent.map((s) => `${s.method} ${s.path}`)).toEqual(
      [
        'POST /products',
        'PUT /products/x-1',
        'PUT /categories/frames',
        'POST /categories',
        'DELETE /categories/frames',
        'PATCH /users/u1/role',
      ].map((r) => r.replace(' /', ' /admin/')),
    );
    expect(sent[1]!.body).toMatchObject({ expectedUpdatedAt: product.updatedAt });
    expect(sent[2]!.body).toEqual(category);
    expect(sent[4]!.body).toBeUndefined();
    // the role alone: the id travels in the path
    expect(sent[5]!.body).toEqual({ role: 'ADMIN' });
    expect(invalidate).toHaveBeenCalledTimes(6);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['admin'] });
  });

  it('refetches nothing after a refused change (a stale edit)', async () => {
    fakeApi({
      'PUT /admin/products/x-1': () =>
        new Response(JSON.stringify({ message: 'Changed since you opened it' }), { status: 409 }),
    });
    const invalidate = vi.spyOn(hooks.client, 'invalidateQueries');
    const { updatedAt, ...input } = product;
    await expect(
      call(useUpdateProduct, 'x-1').mutateAsync({ ...input, expectedUpdatedAt: updatedAt }),
    ).rejects.toMatchObject({ status: 409, message: 'Changed since you opened it' });
    expect(invalidate).not.toHaveBeenCalled();
  });
});

describe('order actions', () => {
  const number = 'RKT-261031-ABCD29';
  const key = ['admin', `/orders/${number}`];

  it('ships with the courier, keeps the order sent back, and tells the dialog it is over', async () => {
    const sent = fakeApi({
      [`POST /admin/orders/${number}/ship`]: () => ({ ...adminOrder, status: 'SHIPPED' }),
    });
    const onSettled = vi.fn();
    call(useAdminOrderActions, number).ship.mutate(
      { courier: 'JNE', trackingNumber: 'JP123456' },
      { onSettled },
    );
    await vi.waitFor(() => expect(onSettled).toHaveBeenCalledOnce());
    expect(sent[0]!.body).toEqual({ courier: 'JNE', trackingNumber: 'JP123456' });
    expect(hooks.client.getQueryData(key)).toMatchObject({ status: 'SHIPPED' });
  });

  it('delivers and refunds with no body, and keeps the order on screen when one is refused', async () => {
    fakeApi({
      [`POST /admin/orders/${number}/deliver`]: () => ({ ...adminOrder, status: 'DELIVERED' }),
      [`POST /admin/orders/${number}/refund`]: () =>
        new Response(JSON.stringify({ message: 'No refund is due' }), { status: 409 }),
    });
    const actions = call(useAdminOrderActions, number);
    const delivered = vi.fn();
    actions.deliver.mutate({ onSettled: delivered });
    await vi.waitFor(() => expect(delivered).toHaveBeenCalledOnce());
    expect(hooks.client.getQueryData(key)).toMatchObject({ status: 'DELIVERED' });
    const refunded = vi.fn();
    actions.refund.mutate({ onSettled: refunded });
    await vi.waitFor(() => expect(refunded).toHaveBeenCalledOnce());
    expect(refunded.mock.calls[0]![1]).toMatchObject({ status: 409 });
    expect(hooks.client.getQueryData(key)).toMatchObject({ status: 'DELIVERED' });
    actions.deliver.mutate();
    await vi.waitFor(() => expect(hooks.client.getQueryData(key)).toMatchObject({ status: 'DELIVERED' }));
  });
});
