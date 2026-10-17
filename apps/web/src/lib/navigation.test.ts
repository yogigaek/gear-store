import { describe, expect, it } from 'vitest';
import { afterSignIn, safeNext } from './navigation';

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

describe('afterSignIn', () => {
  it('goes back to the page that asked for the sign-in', () => {
    expect(afterSignIn('CUSTOMER', '/checkout')).toBe('/checkout');
    expect(afterSignIn('ADMIN', '/orders')).toBe('/orders');
  });
  it('otherwise opens the dashboard for an administrator and the account for a customer', () => {
    expect(afterSignIn('ADMIN', null)).toBe('/admin');
    expect(afterSignIn('CUSTOMER', null)).toBe('/account');
  });
  it('never leaves the site', () => {
    expect(afterSignIn('CUSTOMER', '//evil.example')).toBe('/account');
  });
});
