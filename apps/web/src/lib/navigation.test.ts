import { describe, expect, it } from 'vitest';
import { buyNowPath } from './buy-now';
import { afterSignIn, safeNext, signInPath } from './navigation';

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
    ['/\t/evil.example', '/account'],
    ['/\n/evil.example', '/account'],
    ['/products\\..\\evil.example', '/account'],
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

describe('signInPath', () => {
  // what the sign-in page reads back from its own URL, then where it sends the visitor
  const landing = (path: string) =>
    afterSignIn('CUSTOMER', new URL(signInPath(path), 'https://rakit.example').searchParams.get('next'));

  it('comes back to a Buy now checkout with its part, finish and quantity intact', () => {
    const buyNow = buyNowPath({ slug: 'e1-frame-m', colorKey: 'moss', quantity: 1 });
    expect(signInPath(buyNow)).toBe('/sign-in?next=%2Fcheckout%3Fbuy%3De1-frame-m%26finish%3Dmoss%26qty%3D1');
    expect(landing(buyNow)).toBe(buyNow);
  });

  it('keeps the whole path in one parameter, so nothing in it reaches the sign-in page itself', () => {
    expect([
      ...new URL(signInPath('/checkout?buy=a&next=//evil.example'), 'https://x.example').searchParams.keys(),
    ]).toEqual(['next']);
    expect(landing('/checkout?buy=a&next=//evil.example')).toBe('/checkout?buy=a&next=//evil.example');
  });
});
