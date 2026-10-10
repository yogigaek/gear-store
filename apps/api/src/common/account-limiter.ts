import { Injectable } from '@nestjs/common';

interface Window {
  count: number;
  resetAt: number;
}

/**
 * Counts attempts per key (an email address) in fixed windows, in memory. Per-IP limits depend on knowing the
 * visitor's real address behind proxies; these do not, so a brute force or an email flood aimed at one
 * account is capped however many addresses it comes from. One API instance, so memory is enough.
 */
@Injectable()
export class AccountLimiter {
  private readonly windows = new Map<string, Window>();

  /** Attempts already counted for this key in the current window. */
  used(key: string, now = Date.now()): number {
    const w = this.windows.get(key);
    return w && w.resetAt > now ? w.count : 0;
  }

  /** Seconds until the key's window ends (0 when it has none). */
  retryAfter(key: string, now = Date.now()): number {
    const w = this.windows.get(key);
    return w && w.resetAt > now ? Math.ceil((w.resetAt - now) / 1000) : 0;
  }

  /** Counts one attempt and returns the new total. */
  hit(key: string, windowMs: number, now = Date.now()): number {
    if (this.windows.size > 10_000) this.prune(now);
    const w = this.windows.get(key);
    if (!w || w.resetAt <= now) {
      this.windows.set(key, { count: 1, resetAt: now + windowMs });
      return 1;
    }
    w.count += 1;
    return w.count;
  }

  reset(key: string): void {
    this.windows.delete(key);
  }

  private prune(now: number): void {
    for (const [key, w] of this.windows) if (w.resetAt <= now) this.windows.delete(key);
  }
}
