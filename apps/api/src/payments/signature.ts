import { createHash, timingSafeEqual } from 'node:crypto';
import type { MidtransStatus } from './midtrans.client.js';

/** Midtrans signs each status with SHA-512(order_id + status_code + gross_amount + server key). */
export function expectedSignature(
  status: Pick<MidtransStatus, 'order_id' | 'status_code' | 'gross_amount'>,
  serverKey: string,
): string {
  return createHash('sha512')
    .update(`${status.order_id}${status.status_code}${status.gross_amount}${serverKey}`)
    .digest('hex');
}

export function signatureValid(status: MidtransStatus, serverKey: string): boolean {
  const expected = Buffer.from(expectedSignature(status, serverKey), 'utf8');
  const given = Buffer.from(status.signature_key, 'utf8');
  // constant-time compare: response timing must not reveal how much of a forged signature matched
  return expected.length === given.length && timingSafeEqual(expected, given);
}
