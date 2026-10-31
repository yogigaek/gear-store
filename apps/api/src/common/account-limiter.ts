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

  private prune(now: number): void {
    for (const [key, w] of this.windows) if (w.resetAt <= now) this.windows.delete(key);
  }
}
