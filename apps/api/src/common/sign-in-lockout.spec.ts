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

  it('says whether a key has a failure on record, until a success or a day without failures', () => {
    const lockout = new SignInLockout(rule);
    const t0 = 1_000_000;
    expect(lockout.hasFailures('a', t0)).toBe(false);
    lockout.fail('a', t0);
    expect(lockout.hasFailures('a', t0)).toBe(true);
    expect(lockout.hasFailures('a', t0 + 24 * 60 * MINUTE + 1)).toBe(false);
    lockout.fail('b', t0);
    lockout.succeed('b');
    expect(lockout.hasFailures('b', t0)).toBe(false);
  });

  it('holds at most its cap of keys, forgetting the least recently failed first', () => {
    const lockout = new SignInLockout(rule, 3);
    const t0 = 1_000_000;
    for (const key of ['a', 'b', 'c']) lockout.fail(key, t0);
    lockout.fail('a', t0 + 1); // a failed again: b is now the oldest
    lockout.fail('d', t0 + 2);
    expect(['a', 'b', 'c', 'd'].map((k) => lockout.hasFailures(k, t0 + 2))).toEqual([
      true,
      false,
      true,
      true,
    ]);
  });

  it('never forgets a key whose pause is still running, and still counts new keys when only such keys are left', () => {
    const t0 = 1_000_000;
    const lockout = new SignInLockout(rule, 2);
    for (let i = 0; i < 5; i += 1) lockout.fail('paused', t0);
    lockout.fail('b', t0 + 1);
    lockout.fail('c', t0 + 2); // over the cap: b goes, the older but paused key stays
    expect(lockout.pausedFor('paused', t0 + 2)).toBe(MINUTE - 2);
    expect(lockout.hasFailures('b', t0 + 2)).toBe(false);
    for (let i = 0; i < 4; i += 1) lockout.fail('c', t0 + 3);
    expect(lockout.pausedFor('c', t0 + 3)).toBe(MINUTE);
    // full of running pauses: a new key is still kept and counted, so its own limit applies
    expect(lockout.fail('d', t0 + 4)).toBe(0);
    for (let i = 0; i < 4; i += 1) lockout.fail('d', t0 + 5);
    expect(lockout.pausedFor('d', t0 + 5)).toBe(MINUTE);
    expect(lockout.pausedFor('paused', t0 + 5)).toBeGreaterThan(0);
    expect(lockout.pausedFor('c', t0 + 5)).toBeGreaterThan(0);
  });

  it('forgets every key that starts with a prefix', () => {
    const lockout = new SignInLockout(rule);
    for (const key of ['login:a@x|1', 'login:a@x|2', 'login:ab@x|1']) lockout.fail(key);
    lockout.forgetStartingWith('login:a@x|');
    expect(['login:a@x|1', 'login:a@x|2', 'login:ab@x|1'].map((k) => lockout.hasFailures(k))).toEqual([
      false,
      false,
      true,
    ]);
  });

  it('keeps keys apart', () => {
    const lockout = new SignInLockout(rule);
    for (let i = 0; i < 5; i += 1) lockout.fail('a');
    expect(lockout.pausedFor('a')).toBeGreaterThan(0);
    expect(lockout.pausedFor('b')).toBe(0);
  });
});
