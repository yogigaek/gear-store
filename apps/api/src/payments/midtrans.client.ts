import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';

/** The fields of a Midtrans transaction status we act on; the same shape arrives by webhook and from the status API. */
export const midtransStatusSchema = z.object({
  order_id: z.string(),
  status_code: z.string(),
  gross_amount: z.string(),
  signature_key: z.string(),
  transaction_status: z.string(),
  transaction_id: z.string().optional(),
  payment_type: z.string().optional(),
  fraud_status: z.string().optional(),
});
export type MidtransStatus = z.infer<typeof midtransStatusSchema>;

export interface SnapRequest {
  transaction_details: { order_id: string; gross_amount: number };
  item_details: { id: string; price: number; quantity: number; name: string }[];
  customer_details: { first_name: string; email: string; phone: string };
  expiry: { start_time: string; unit: 'minute'; duration: number };
  callbacks: { finish: string };
}

export class MidtransError extends Error {}

/** Thin HTTP client; swapped for a fake in tests. Errors never include the server key. */
@Injectable()
export class MidtransClient {
  private readonly auth: string;
  private readonly snapUrl: string;
  private readonly apiUrl: string;

  constructor(@Inject(ENV) env: Env) {
    this.auth = `Basic ${Buffer.from(`${env.MIDTRANS_SERVER_KEY}:`).toString('base64')}`;
    this.snapUrl = env.MIDTRANS_PRODUCTION ? 'https://app.midtrans.com' : 'https://app.sandbox.midtrans.com';
    this.apiUrl = env.MIDTRANS_PRODUCTION ? 'https://api.midtrans.com' : 'https://api.sandbox.midtrans.com';
  }

  async createSnapTransaction(body: SnapRequest): Promise<{ token: string; redirect_url: string }> {
    const res = await this.request(`${this.snapUrl}/snap/v1/transactions`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return z.object({ token: z.string(), redirect_url: z.url() }).parse(res);
  }

  /** null when Midtrans has no transaction for this order yet (the buyer never opened the payment page). */
  async getStatus(orderId: string): Promise<MidtransStatus | null> {
    const res = await this.request(`${this.apiUrl}/v2/${encodeURIComponent(orderId)}/status`, {
      method: 'GET',
    });
    const parsed = midtransStatusSchema.safeParse(res);
    if (parsed.success) return parsed.data;
    if (z.object({ status_code: z.literal('404') }).safeParse(res).success) return null;
    throw new MidtransError('Unexpected status response from Midtrans');
  }

  private async request(url: string, init: RequestInit): Promise<unknown> {
    let res: Response;
    try {
      res = await fetch(url, {
        ...init,
        headers: { Authorization: this.auth, Accept: 'application/json', 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      throw new MidtransError(`Midtrans unreachable: ${error instanceof Error ? error.name : 'error'}`);
    }
    const body: unknown = await res.json().catch(() => null);
    if (!res.ok && !(res.status === 404 && body)) {
      throw new MidtransError(`Midtrans replied ${res.status}`);
    }
    return body;
  }
}
