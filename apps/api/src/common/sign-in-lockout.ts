interface Entry {
  /** failures since the last pause began (or ever, before the first one) */
  failures: number;
  /** pauses served so far; each one is twice as long as the one before */
  pauses: number;
  pausedUntil: number;
  lastFailure: number;
}

export interface LockoutRule {
  /** failed attempts allowed before the first pause */
  failuresBeforePause: number;
  firstPauseMs: number;
  maxPauseMs: number;
  /** a key with no failure for this long starts over with a clean slate */
  forgetAfterMs: number;
}

/**
 * Escalating pauses after failed sign-ins: a few mistakes are free, then a short pause, and every failure after
 * that pause doubles the next one up to a cap. A success clears the key. In memory, like the other limits: the
 * API runs as one instance, and a restart forgetting the counts only ever loosens them.
 */
export class SignInLockout {
  private readonly entries = new Map<string, Entry>();

  constructor(
    private readonly rule: LockoutRule,
    /** a soft cap on memory: past it, keys with no running pause are forgotten, least recently failed first */
    private readonly maxKeys = 20_000,
  ) {}

  /** Milliseconds the key must still wait (0 when it may try). */
  pausedFor(key: string, now = Date.now()): number {
    const e = this.current(key, now);
    return e ? Math.max(0, e.pausedUntil - now) : 0;
  }

  /** Whether the key has a failure on record (one not yet forgotten). */
  hasFailures(key: string, now = Date.now()): boolean {
    return this.current(key, now) !== undefined;
  }

  /** Failed attempts left before the next pause. */
  attemptsLeft(key: string, now = Date.now()): number {
    const e = this.current(key, now);
    if (!e) return this.rule.failuresBeforePause;
    return e.pauses === 0 ? this.rule.failuresBeforePause - e.failures : 0;
  }

  /** Records a failure; returns the pause it started, in milliseconds (0 when none). */
  fail(key: string, now = Date.now()): number {
    const e = this.current(key, now) ?? { failures: 0, pauses: 0, pausedUntil: 0, lastFailure: now };
    e.failures += 1;
    e.lastFailure = now;
    // re-inserted, so the map stays in order of last failure and the oldest key is the first one out
    this.entries.delete(key);
    this.entries.set(key, e);
    // before the first pause a few mistakes are free; after it, every failure pauses again, for longer
    let pause = 0;
    if (e.pauses > 0 || e.failures >= this.rule.failuresBeforePause) {
      pause = Math.min(this.rule.firstPauseMs * 2 ** e.pauses, this.rule.maxPauseMs);
      e.pauses += 1;
      e.failures = 0;
      e.pausedUntil = now + pause;
    }
    for (const [oldest, entry] of this.entries) {
      if (this.entries.size <= this.maxKeys) break;
      if (oldest !== key && entry.pausedUntil <= now) this.entries.delete(oldest);
    }
    // past the cap with only running pauses left, keys are kept anyway: they expire, and dropping one would lift a limit
    return pause;
  }

  /** Forgets every key starting with `prefix` (an account's per-network keys, after its password is reset). */
  forgetStartingWith(prefix: string): void {
    for (const key of this.entries.keys()) if (key.startsWith(prefix)) this.entries.delete(key);
  }

  succeed(key: string): void {
    this.entries.delete(key);
  }

  private current(key: string, now: number): Entry | undefined {
    const e = this.entries.get(key);
    if (e && now - e.lastFailure > this.rule.forgetAfterMs && e.pausedUntil <= now) {
      this.entries.delete(key);
      return undefined;
    }
    return e;
  }
}
