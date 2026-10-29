import { execSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';

export const API = process.env['API_URL'] ?? 'http://localhost:3000/api';
const MAILPIT = process.env['MAILPIT_URL'] ?? 'http://localhost:8025';
export const PASSWORD = 'correct horse battery';

/** A fresh visitor address for each test, so per-IP rate limits never couple tests together. */
export const visitorIp = () => `198.51.100.${Math.floor(Math.random() * 250) + 1}`;

export const testEmail = (tag: string) => `${tag}-${Date.now()}-${randomUUID().slice(0, 6)}@test.example`;

/** The confirmation or reset link most recently emailed to an address (waits for Mailpit to receive it). */
export async function emailedLink(to: string, path: '/verify-email' | '/reset-password'): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
    const list = (await res.json()) as { messages: { ID: string }[] };
    if (list.messages.length) {
      const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${list.messages[0]!.ID}`)).json()) as {
        Text: string;
      };
      const link = msg.Text.match(new RegExp(`https?://\\S+${path}\\?token=[\\w-]{43}`))?.[0];
      if (link) return new URL(link).pathname + new URL(link).search;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`No ${path} email for ${to}`);
}

/** What Midtrans would POST when a payment settles, signed with the server key the API was started with. */
export async function settlePayment(orderNumber: string, total: number): Promise<void> {
  const serverKey = process.env['MIDTRANS_SERVER_KEY'];
  if (!serverKey) throw new Error('MIDTRANS_SERVER_KEY must match the running API');
  const body = {
    order_id: orderNumber,
    status_code: '200',
    gross_amount: `${total}.00`,
    transaction_status: 'settlement',
    transaction_id: randomUUID(),
    payment_type: 'qris',
  };
  const signature_key = createHash('sha512')
    .update(body.order_id + body.status_code + body.gross_amount + serverKey)
    .digest('hex');
  const res = await fetch(`${API}/payments/midtrans/notification`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...body, signature_key }),
  });
  if (!res.ok) throw new Error(`Notification refused: ${res.status} ${await res.text()}`);
}

/** Signs up through the API and confirms the email, for tests whose subject is not registration. */
export async function confirmedAccount(tag: string, name = 'E2E Customer'): Promise<string> {
  const email = testEmail(tag);
  const headers = { 'content-type': 'application/json', 'x-forwarded-for': visitorIp() };
  await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ name, email, password: PASSWORD }),
  });
  const link = await emailedLink(email, '/verify-email');
  const token = new URLSearchParams(link.split('?')[1]).get('token');
  const res = await fetch(`${API}/auth/verify-email`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ token }),
  });
  if (!res.ok) throw new Error(`Could not confirm ${email}`);
  return email;
}

export function grantAdmin(email: string): void {
  const root = fileURLToPath(new URL('../..', import.meta.url));
  execSync(`npm run admin:grant -w @gear-store/api -- ${email}`, { cwd: root, stdio: 'pipe' });
}

export async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'));
}

/** Midtrans is out of reach in tests: make "Pay now" fail the way it does when the provider is down. */
export async function paymentProviderDown(page: Page): Promise<void> {
  await page.route('**/api/me/orders/*/pay', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        statusCode: 503,
        message: 'The payment provider is not responding. Try again in a minute.',
        code: 'PAYMENTS_UNAVAILABLE',
      }),
    }),
  );
}
