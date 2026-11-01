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

  it('forgets ended windows once it holds more than 10,000 keys, and keeps running ones', () => {
    const limiter = new AccountLimiter();
    const t0 = 1_000_000;
    limiter.hit('running', 120_000, t0);
    for (let i = 0; i <= 10_000; i += 1) limiter.hit(`old-${i}`, 1_000, t0);
    const windows = (limiter as unknown as { windows: Map<string, unknown> }).windows;
    expect(windows.size).toBe(10_002);
    limiter.hit('new', 60_000, t0 + 2_000);
    expect(windows.size).toBe(2);
    expect(limiter.hit('running', 120_000, t0 + 2_000)).toBe(2);
  });

  it('keeps keys apart', () => {
    const limiter = new AccountLimiter();
    limiter.hit('a', 60_000);
    expect(limiter.hit('a', 60_000)).toBe(2);
    expect(limiter.hit('b', 60_000)).toBe(1);
  });
});
