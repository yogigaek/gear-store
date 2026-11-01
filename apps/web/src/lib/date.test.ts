import { describe, expect, it } from 'vitest';
import { formatDateTime } from './date';

describe('formatDateTime', () => {
  it.each([
    ['2026-10-09T07:05:00.000Z', '9 Oct 2026, 14:05 WIB'],
    // late evening UTC is the next day in Jakarta
    ['2026-12-31T17:00:00.000Z', '1 Jan 2027, 00:00 WIB'],
    ['2026-12-31T16:59:00.000Z', '31 Dec 2026, 23:59 WIB'],
    ['2026-10-09T14:05:00+07:00', '9 Oct 2026, 14:05 WIB'],
  ])('%s → %s, whatever the visitor’s zone', (iso, expected) => {
    expect(formatDateTime(iso)).toBe(expected);
  });
});
