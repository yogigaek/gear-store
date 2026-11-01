import type { Env } from '../config/env.js';
import { MidtransClient, MidtransError, type SnapRequest } from './midtrans.client.js';

const KEY = 'SB-Mid-server-unit-test-key';
const env = (production = false) => ({ MIDTRANS_SERVER_KEY: KEY, MIDTRANS_PRODUCTION: production }) as Env;

const SNAP: SnapRequest = {
  transaction_details: { order_id: 'RKT-261101-ABCDEF', gross_amount: 100_000 },
  item_details: [{ id: 'part', price: 100_000, quantity: 1, name: 'Part' }],
  customer_details: { first_name: 'Ana', email: 'ana@test.example', phone: '+6281234567890' },
  expiry: { start_time: '2026-11-01 10:00:00 +0700', unit: 'minute', duration: 60 },
  callbacks: { finish: 'http://localhost:5173/payment-done' },
};

const STATUS = {
  order_id: 'RKT-261101-ABCDEF',
  status_code: '200',
  gross_amount: '100000.00',
  signature_key: 'sig',
  transaction_status: 'settlement',
};

function reply(status: number, body: unknown) {
  return new Response(body === undefined ? 'not json' : JSON.stringify(body), { status });
}

describe('MidtransClient', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates a Snap transaction on the sandbox with the server key as Basic auth', async () => {
    fetchMock.mockResolvedValue(
      reply(201, { token: 't', redirect_url: 'https://app.sandbox.midtrans.com/x' }),
    );
    await expect(new MidtransClient(env()).createSnapTransaction(SNAP)).resolves.toEqual({
      token: 't',
      redirect_url: 'https://app.sandbox.midtrans.com/x',
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://app.sandbox.midtrans.com/snap/v1/transactions');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual(SNAP);
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Basic ${Buffer.from(`${KEY}:`).toString('base64')}`);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('uses the production hosts when MIDTRANS_PRODUCTION is set', async () => {
    fetchMock
      .mockResolvedValueOnce(reply(201, { token: 't', redirect_url: 'https://app.midtrans.com/x' }))
      .mockResolvedValueOnce(reply(200, STATUS));
    const client = new MidtransClient(env(true));
    await client.createSnapTransaction(SNAP);
    await client.getStatus('RKT-261101-ABCDEF');
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      'https://app.midtrans.com/snap/v1/transactions',
      'https://api.midtrans.com/v2/RKT-261101-ABCDEF/status',
    ]);
  });

  it('refuses a Snap reply without a valid redirect URL', async () => {
    fetchMock.mockResolvedValue(reply(201, { token: 't', redirect_url: 'not a url' }));
    await expect(new MidtransClient(env()).createSnapTransaction(SNAP)).rejects.toThrow();
  });

  it.each(['http://app.sandbox.midtrans.com/x', 'javascript:alert(1)', 'intent://pay#Intent;end'])(
    'refuses a Snap redirect URL that is not https: %s',
    async (redirect_url) => {
      // the released app opens this link as given, checking only that it parses as a URL
      fetchMock.mockResolvedValue(reply(201, { token: 't', redirect_url }));
      await expect(new MidtransClient(env()).createSnapTransaction(SNAP)).rejects.toThrow();
    },
  );

  it('marks a 401 as a refused key, and any other failure status as not refused', async () => {
    fetchMock.mockResolvedValueOnce(reply(401, { error_messages: ['Access denied'] }));
    const refused = await new MidtransClient(env())
      .createSnapTransaction(SNAP)
      .catch((e: unknown) => e as MidtransError);
    expect(refused).toBeInstanceOf(MidtransError);
    expect(refused).toMatchObject({ status: 401, keyRefused: true, message: 'Midtrans replied 401' });

    fetchMock.mockResolvedValueOnce(reply(503, undefined));
    const down = await new MidtransClient(env())
      .createSnapTransaction(SNAP)
      .catch((e: unknown) => e as MidtransError);
    expect(down).toMatchObject({ status: 503, keyRefused: false });
  });

  it('reports a timeout or a dropped connection by its kind only, never the key', async () => {
    const failure = (thrown: unknown) => {
      fetchMock.mockRejectedValueOnce(thrown);
      return new MidtransClient(env()).getStatus('X').then(
        () => null,
        (e: unknown) => e as MidtransError,
      );
    };
    const timeout = await failure(new DOMException('The operation timed out.', 'TimeoutError'));
    expect(timeout).toBeInstanceOf(MidtransError);
    expect(timeout).toMatchObject({ message: 'Midtrans unreachable: TimeoutError', status: undefined });
    const odd = await failure('socket hang up');
    expect(odd?.message).toBe('Midtrans unreachable: error');
    expect(`${timeout?.message}${odd?.message}`).not.toContain(KEY);
  });

  it('reads a transaction status, escaping the order id in the URL', async () => {
    fetchMock.mockResolvedValue(reply(200, { ...STATUS, extra: 'dropped' }));
    await expect(new MidtransClient(env()).getStatus('RKT/1?x')).resolves.toEqual(STATUS);
    expect(fetchMock.mock.calls[0]![0]).toBe('https://api.sandbox.midtrans.com/v2/RKT%2F1%3Fx/status');
  });

  it('answers null when Midtrans has no transaction for the order yet', async () => {
    // Midtrans answers an unknown order with HTTP 404 and a JSON body saying so
    fetchMock.mockResolvedValue(reply(404, { status_code: '404', status_message: 'not found' }));
    await expect(new MidtransClient(env()).getStatus('X')).resolves.toBeNull();
  });

  it('treats a 404 without a body as a failure, not as "no transaction"', async () => {
    fetchMock.mockResolvedValue(reply(404, undefined));
    await expect(new MidtransClient(env()).getStatus('X')).rejects.toMatchObject({ status: 404 });
  });

  it('refuses a status reply of an unexpected shape', async () => {
    fetchMock.mockResolvedValue(reply(200, { status_code: '500', status_message: 'oops' }));
    await expect(new MidtransClient(env()).getStatus('X')).rejects.toThrow(
      'Unexpected status response from Midtrans',
    );
  });
});
