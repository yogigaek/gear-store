import { SignInLockout } from './sign-in-lockout.js';

const MINUTE = 60_000;
const rule = {
  failuresBeforePause: 5,
  firstPauseMs: MINUTE,
  maxPauseMs: 60 * MINUTE,
  forgetAfterMs: 24 * 60 * MINUTE,
};

describe('SignInLockout', () => {
  it('allows five failures, then pauses for a minute', () => {
    const lockout = new SignInLockout(rule);
    const t0 = 1_000_000;
    for (let i = 0; i < 4; i += 1) expect(lockout.fail('a', t0)).toBe(0);
    expect(lockout.attemptsLeft('a', t0)).toBe(1);
    expect(lockout.fail('a', t0)).toBe(MINUTE);
    expect(lockout.pausedFor('a', t0 + 15_000)).toBe(45_000);
    expect(lockout.pausedFor('a', t0 + MINUTE)).toBe(0);
  });

  it('doubles the pause with every failure after the first one, up to an hour', () => {
    const lockout = new SignInLockout(rule);
    let now = 1_000_000;
    for (let i = 0; i < 5; i += 1) lockout.fail('a', now);
    const pauses = [];
    for (let i = 0; i < 8; i += 1) {
      now += lockout.pausedFor('a', now); // wait out the pause, then fail once more
      pauses.push(lockout.fail('a', now) / MINUTE);
    }
    expect(pauses).toEqual([2, 4, 8, 16, 32, 60, 60, 60]);
  });

  it('starts over after a success, or after a day without failures', () => {
    const lockout = new SignInLockout(rule);
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i += 1) lockout.fail('a', t0);
    lockout.succeed('a');
    expect(lockout.pausedFor('a', t0)).toBe(0);
    expect(lockout.attemptsLeft('a', t0)).toBe(5);

    for (let i = 0; i < 5; i += 1) lockout.fail('b', t0);
    const tomorrow = t0 + 24 * 60 * MINUTE + 1;
    expect(lockout.attemptsLeft('b', tomorrow)).toBe(5);
    expect(lockout.fail('b', tomorrow)).toBe(0);
  });

  it('keeps keys apart', () => {
    const lockout = new SignInLockout(rule);
    for (let i = 0; i < 5; i += 1) lockout.fail('a');
    expect(lockout.pausedFor('a')).toBeGreaterThan(0);
    expect(lockout.pausedFor('b')).toBe(0);
  });
});
