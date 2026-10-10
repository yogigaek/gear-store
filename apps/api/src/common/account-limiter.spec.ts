import { AccountLimiter } from './account-limiter.js';

describe('AccountLimiter', () => {
  it('counts within a window and starts over after it', () => {
    const limiter = new AccountLimiter();
    const t0 = 1_000_000;
    expect(limiter.hit('a', 60_000, t0)).toBe(1);
    expect(limiter.hit('a', 60_000, t0 + 1)).toBe(2);
    expect(limiter.used('a', t0 + 2)).toBe(2);
    expect(limiter.retryAfter('a', t0 + 30_000)).toBe(30);
    expect(limiter.used('a', t0 + 60_001)).toBe(0);
    expect(limiter.hit('a', 60_000, t0 + 60_001)).toBe(1);
  });

  it('keeps keys apart and forgets a key on reset', () => {
    const limiter = new AccountLimiter();
    limiter.hit('a', 60_000);
    limiter.hit('a', 60_000);
    limiter.hit('b', 60_000);
    expect(limiter.used('a')).toBe(2);
    expect(limiter.used('b')).toBe(1);
    limiter.reset('a');
    expect(limiter.used('a')).toBe(0);
  });
});
