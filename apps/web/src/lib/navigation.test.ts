import { describe, expect, it } from 'vitest';
import { safeNext } from './navigation';

describe('safeNext', () => {
  it.each([
    ['/products?category=audio', '/products?category=audio'],
    ['/account', '/account'],
    [null, '/account'],
    ['', '/account'],
    ['https://evil.example', '/account'],
    ['//evil.example', '/account'],
    ['/\\evil.example', '/account'],
    ['javascript:alert(1)', '/account'],
  ])('%s → %s', (input, expected) => {
    expect(safeNext(input)).toBe(expected);
  });
});
