import { AccountLimiter } from './account-limiter.js';

describe('AccountLimiter', () => {
  it('counts within a window and starts over after it', () => {
    const limiter = new AccountLimiter();
    const t0 = 1_000_000;
    expect(limiter.hit('a', 60_000, t0)).toBe(1);
    expect(limiter.hit('a', 60_000, t0 + 1)).toBe(2);
    expect(limiter.hit('a', 60_000, t0 + 59_999)).toBe(3);
    expect(limiter.hit('a', 60_000, t0 + 60_001)).toBe(1);
  });

  it('keeps keys apart', () => {
    const limiter = new AccountLimiter();
    limiter.hit('a', 60_000);
    expect(limiter.hit('a', 60_000)).toBe(2);
    expect(limiter.hit('b', 60_000)).toBe(1);
  });
});
