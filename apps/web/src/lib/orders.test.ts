import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { address, order } from '../test/fixtures';
import { auth, call, fakeApi, fetchQuery, hooks, query, resetHooks } from '../test/query-hooks';
import { ApiError } from './api';
import {
  paymentPage,
  useAddresses,
  useCheckout,
  useDeleteAddress,
  useOrder,
  useOrderActions,
  useOrders,
  useSaveAddress,
} from './orders';

vi.mock('@tanstack/react-query', async (actual) =>
  (await import('../test/query-hooks')).mockReactQuery(
    await actual<typeof import('@tanstack/react-query')>(),
  ),
);
vi.mock('./auth-context', async () => {
  const { auth } = await import('../test/query-hooks');
  return { useAuth: () => auth };
});
// useOrder keeps the status it last saw in a ref: refs live across "renders", effects run at once
const refs = vi.hoisted(() => ({ list: [] as { current: unknown }[], next: 0 }));
vi.mock('react', async (actual) => ({
  ...(await actual<typeof import('react')>()),
  useRef: (initial: unknown) => (refs.list[refs.next++] ??= { current: initial }),
  useEffect: (effect: () => void) => effect(),
}));

const NUMBER = 'RKT-261031-ABCD29';
const invalidated = () =>
  vi.spyOn(hooks.client, 'invalidateQueries').mock.calls as unknown as [
    { queryKey: unknown[]; exact?: boolean },
  ][];

beforeEach(() => {
  resetHooks();
  refs.list = [];
  refs.next = 0;
});
afterEach(() => vi.unstubAllGlobals());

describe('addresses', () => {
  it('reads the addresses only when signed in', async () => {
    auth.status = 'signed-out';
    call(useAddresses);
    expect(query('me', 'addresses').enabled).toBe(false);
    auth.status = 'signed-in';
    fakeApi({ 'GET /me/addresses': () => [address(), address({ isDefault: false })] });
    call(useAddresses);
    expect(await fetchQuery(query('me', 'addresses'))).toHaveLength(2);
  });

  it('adds a new address, edits one by its id, deletes one, and rereads the list each time', async () => {
    const saved = address();
    const sent = fakeApi({
      'POST /me/addresses': () => saved,
      [`PUT /me/addresses/${saved.id}`]: () => saved,
      [`DELETE /me/addresses/${saved.id}`]: () => undefined,
    });
    const invalidate = vi.spyOn(hooks.client, 'invalidateQueries');
    const { id: _, shippingFee: __, shippingEta: ___, ...input } = saved;
    await call(useSaveAddress).mutateAsync({ input });
    await call(useSaveAddress).mutateAsync({ id: saved.id, input });
    await call(useDeleteAddress).mutateAsync(saved.id);
    expect(sent.map((s) => s.method)).toEqual(['POST', 'PUT', 'DELETE']);
    expect(invalidate).toHaveBeenCalledTimes(3);
    expect(invalidate).toHaveBeenLastCalledWith({ queryKey: ['me', 'addresses'] });
  });
});

describe('orders', () => {
  it('reads the list only when asked and signed in', () => {
    call(useOrders, { enabled: false });
    call(useOrders);
    auth.status = 'restoring';
    call(useOrders);
    expect(hooks.queries.map((q) => q.enabled)).toEqual([false, true, false]);
  });

  it('reads the list with the token', async () => {
    fakeApi({
      'GET /me/orders': () => [{ number: NUMBER, status: 'PAID', total: 1, itemCount: 1, createdAt: 'x' }],
    });
    call(useOrders);
    expect(await fetchQuery(query('me', 'orders'))).toHaveLength(1);
  });

  it('encodes the order number in the path', async () => {
    const sent = fakeApi({});
    call(useOrder, '../addresses');
    await expect(fetchQuery(query('me', 'orders', '../addresses'))).rejects.toMatchObject({ status: 404 });
    expect(sent[0]!.path).toBe('/me/orders/..%2Faddresses');
  });

  it.each([
    [true, true, true, 8000],
    [true, true, false, false],
    [true, false, true, false],
    [false, true, true, false],
  ])('watching %s, payable %s, payment opened %s: re-reads every %s (ms)', (watch, canPay, opened, every) => {
    call(useOrder, NUMBER, { watchPayment: watch });
    const data = order({
      canPay,
      payment: opened ? { redirectUrl: 'https://pay.example', status: null, method: null } : null,
    });
    expect(query('me', 'orders', NUMBER).refetchInterval({ state: { data } })).toBe(every);
  });

  it('does not re-read before the order has loaded', () => {
    call(useOrder, NUMBER, { watchPayment: true });
    expect(query('me', 'orders', NUMBER).refetchInterval({ state: { data: undefined } })).toBe(false);
  });

  it('rereads the order list once the order on screen moves on, and not before', () => {
    const calls = invalidated();
    const render = (status: string | undefined) => {
      refs.next = 0;
      hooks.state = () => ({ data: status && order({ status: status as 'PAID' }) });
      call(useOrder, NUMBER);
    };
    render(undefined);
    render('PENDING_PAYMENT');
    render('PENDING_PAYMENT');
    expect(calls).toHaveLength(0);
    render('PAID');
    expect(calls).toEqual([[{ queryKey: ['me', 'orders'], exact: true }]]);
  });
});

describe('order actions', () => {
  const path = `/me/orders/${NUMBER}`;

  it('opens the payment page the API names', async () => {
    const assign = vi.fn();
    vi.stubGlobal('window', { location: { assign } });
    fakeApi({ [`POST ${path}/pay`]: () => ({ redirectUrl: 'https://app.sandbox.midtrans.com/snap/v4/x' }) });
    await call(useOrderActions, NUMBER).pay.mutateAsync();
    expect(assign).toHaveBeenCalledWith('https://app.sandbox.midtrans.com/snap/v4/x');
  });

  it.each([
    'javascript:alert(document.cookie)',
    'data:text/html,<script>',
    'http://app.midtrans.com/x',
    'not a url',
  ])('never leaves the page for %j', async (redirectUrl) => {
    const assign = vi.fn();
    vi.stubGlobal('window', { location: { assign } });
    fakeApi({ [`POST ${path}/pay`]: () => ({ redirectUrl }) });
    await expect(call(useOrderActions, NUMBER).pay.mutateAsync()).rejects.toThrow();
    expect(assign).not.toHaveBeenCalled();
  });

  it('keeps the order a status check or a cancel sends back, and rereads the list', async () => {
    fakeApi({
      [`POST ${path}/payment-status`]: () => order({ status: 'PAID' }),
      [`POST ${path}/cancel`]: () => order({ status: 'CANCELLED' }),
    });
    const calls = invalidated();
    const actions = call(useOrderActions, NUMBER);
    await actions.checkStatus.mutateAsync();
    expect(hooks.client.getQueryData(['me', 'orders', NUMBER])).toMatchObject({ status: 'PAID' });
    await actions.cancel.mutateAsync();
    expect(hooks.client.getQueryData(['me', 'orders', NUMBER])).toMatchObject({ status: 'CANCELLED' });
    expect(calls).toHaveLength(2);
  });

  it('updates the order quietly from a background pull, without rereading the list', async () => {
    fakeApi({ [`POST ${path}/payment-status`]: () => order({ status: 'EXPIRED' }) });
    const calls = invalidated();
    await call(useOrderActions, NUMBER).pullStatus.mutateAsync();
    expect(hooks.client.getQueryData(['me', 'orders', NUMBER])).toMatchObject({ status: 'EXPIRED' });
    expect(calls).toHaveLength(0);
  });
});

describe('useCheckout', () => {
  const input = { addressId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() };
  const keys = (calls: [{ queryKey: unknown[] }][]) => calls.map(([f]) => f.queryKey);

  it('keeps the new order and rereads the cart, the lists and the stock it changed', async () => {
    const sent = fakeApi({ 'POST /me/orders': () => order() });
    const calls = invalidated();
    await call(useCheckout).mutateAsync(input);
    expect(sent[0]!.body).toEqual(input);
    expect(hooks.client.getQueryData(['me', 'orders', NUMBER])).toMatchObject({ number: NUMBER });
    expect(keys(calls)).toEqual([
      ['me', 'cart'],
      ['me', 'orders'],
      ['products'],
      ['product'],
      ['cart', 'lines'],
    ]);
  });

  it('leaves the cart alone after a Buy now', async () => {
    fakeApi({ 'POST /me/orders': () => order() });
    const calls = invalidated();
    await call(useCheckout).mutateAsync({
      ...input,
      items: [{ slug: 'fender-set', colorKey: '', quantity: 1 }],
    });
    expect(keys(calls)).not.toContainEqual(['me', 'cart']);
  });

  it('after a lost reply rereads only the order list: the order may exist and hold its stock', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')));
    const calls = invalidated();
    await expect(call(useCheckout).mutateAsync(input)).rejects.toMatchObject({ status: 0 });
    expect(calls).toEqual([[{ queryKey: ['me', 'orders'], exact: true }]]);
  });

  it('after a refusal rereads what was priced: the cart, or the Buy now line', async () => {
    fakeApi({
      'POST /me/orders': () => new Response(JSON.stringify({ message: 'Out of stock' }), { status: 409 }),
    });
    const calls = invalidated();
    await expect(call(useCheckout).mutateAsync(input)).rejects.toBeInstanceOf(ApiError);
    await expect(
      call(useCheckout).mutateAsync({ ...input, items: [{ slug: 'fender-set', colorKey: '', quantity: 1 }] }),
    ).rejects.toMatchObject({ status: 409 });
    expect(keys(calls)).toEqual([
      ['me', 'cart'],
      ['cart', 'lines'],
    ]);
  });

  it('rereads the cart after any other failure, such as an unreadable reply', async () => {
    fakeApi({ 'POST /me/orders': () => ({ number: NUMBER }) });
    const calls = invalidated();
    await expect(call(useCheckout).mutateAsync(input)).rejects.toThrow();
    expect(keys(calls)).toEqual([['me', 'cart']]);
  });
});

describe('paymentPage (checkout and the order page both leave through it)', () => {
  it('reads the https page the API names for the order', async () => {
    const sent = fakeApi({
      [`POST /me/orders/${NUMBER}/pay`]: () => ({ redirectUrl: 'https://app.midtrans.com/x' }),
    });
    expect(await paymentPage('tok', NUMBER)).toBe('https://app.midtrans.com/x');
    expect(sent[0]).toMatchObject({ method: 'POST', auth: 'Bearer tok' });
  });

  it.each([
    'javascript:alert(document.cookie)',
    'data:text/html,<script>',
    'http://app.midtrans.com/x',
    'not a url',
  ])('refuses %j', async (redirectUrl) => {
    fakeApi({ [`POST /me/orders/${NUMBER}/pay`]: () => ({ redirectUrl }) });
    await expect(paymentPage('tok', NUMBER)).rejects.toThrow();
  });

  it('encodes the order number in the path', async () => {
    const sent = fakeApi({});
    await expect(paymentPage('tok', '../addresses')).rejects.toMatchObject({ status: 404 });
    expect(sent[0]!.path).toBe('/me/orders/..%2Faddresses/pay');
  });
});
