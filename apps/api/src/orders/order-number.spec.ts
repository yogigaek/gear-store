import { orderNumberSchema } from '@gear-store/shared';
import { newOrderNumber } from './order-number.js';

describe('newOrderNumber', () => {
  it('matches the public format', () => {
    for (let i = 0; i < 200; i += 1) expect(orderNumberSchema.safeParse(newOrderNumber()).success).toBe(true);
  });

  it('dates the order in Jakarta time', () => {
    // 20:00 UTC on 9 Oct is 03:00 on 10 Oct in Jakarta
    expect(newOrderNumber(new Date('2026-10-09T20:00:00Z'))).toMatch(/^RKT-261010-/);
  });

  it('does not repeat in practice', () => {
    const seen = new Set(Array.from({ length: 2000 }, () => newOrderNumber()));
    expect(seen.size).toBe(2000);
  });
});
