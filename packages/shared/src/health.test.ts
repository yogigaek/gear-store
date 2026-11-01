import { describe, expect, it } from 'vitest';
import { healthResponseSchema } from './health.js';

describe('health', () => {
  it('reports ok or degraded, with the database up or down', () => {
    expect(healthResponseSchema.parse({ status: 'degraded', database: 'down' })).toEqual({
      status: 'degraded',
      database: 'down',
    });
    expect(healthResponseSchema.safeParse({ status: 'fine', database: 'up' }).success).toBe(false);
    expect(healthResponseSchema.safeParse({ status: 'ok' }).success).toBe(false);
  });
});
