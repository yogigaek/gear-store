import { createHash } from 'node:crypto';
import { expectedSignature, signatureValid } from './signature.js';

const base = {
  order_id: 'RKT-261009-ABCDEF',
  status_code: '200',
  gross_amount: '1284000.00',
  transaction_status: 'settlement',
};

describe('Midtrans signature', () => {
  it('matches the documented formula', () => {
    const manual = createHash('sha512')
      .update('RKT-261009-ABCDEF2001284000.00SB-Mid-server-key')
      .digest('hex');
    expect(expectedSignature(base, 'SB-Mid-server-key')).toBe(manual);
  });

  it('accepts the right signature and rejects any change', () => {
    const signature_key = expectedSignature(base, 'SB-Mid-server-key');
    expect(signatureValid({ ...base, signature_key }, 'SB-Mid-server-key')).toBe(true);
    expect(signatureValid({ ...base, signature_key }, 'another-key')).toBe(false);
    expect(signatureValid({ ...base, gross_amount: '1.00', signature_key }, 'SB-Mid-server-key')).toBe(false);
    expect(signatureValid({ ...base, signature_key: 'short' }, 'SB-Mid-server-key')).toBe(false);
  });
});
