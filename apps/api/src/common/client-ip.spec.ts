import type { Request } from 'express';
import { clientIp } from './client-ip.js';

const req = (headers: Record<string, string>, ip = '10.0.0.1') =>
  ({ headers, ip, socket: {} }) as unknown as Request;
const order = ['x-vercel-forwarded-for', 'true-client-ip'];

describe('clientIp', () => {
  it('prefers the first configured header that is present', () => {
    expect(
      clientIp(req({ 'x-vercel-forwarded-for': '103.149.19.54', 'true-client-ip': '13.250.114.58' }), order),
    ).toBe('103.149.19.54');
    expect(clientIp(req({ 'true-client-ip': '103.149.19.65' }), order)).toBe('103.149.19.65');
  });

  it('takes the first address of a list and ignores X-Forwarded-For entirely', () => {
    expect(
      clientIp(req({ 'x-vercel-forwarded-for': '1.2.3.4, 5.6.7.8', 'x-forwarded-for': '9.9.9.9' }), order),
    ).toBe('1.2.3.4');
  });

  it('falls back to req.ip when nothing is configured or present', () => {
    expect(clientIp(req({ 'x-vercel-forwarded-for': '1.2.3.4' }), [])).toBe('10.0.0.1');
    expect(clientIp(req({}), order)).toBe('10.0.0.1');
  });

  describe('with the web proxy’s secret', () => {
    const secret = 'a-proxy-secret-of-at-least-32-characters';
    const sent = (proxy?: string) => ({
      'x-vercel-forwarded-for': '1.2.3.4',
      'true-client-ip': '5.6.7.8',
      ...(proxy !== undefined && { 'x-rakit-proxy': proxy }),
    });

    it('trusts x-vercel-forwarded-for when the request carries the secret', () => {
      expect(clientIp(req(sent(secret)), order, secret)).toBe('1.2.3.4');
    });

    it('skips it without the secret or with a wrong one, falling back to the next header or req.ip', () => {
      expect(clientIp(req(sent()), order, secret)).toBe('5.6.7.8');
      expect(clientIp(req(sent('wrong')), order, secret)).toBe('5.6.7.8');
      expect(clientIp(req(sent(`${secret}x`)), order, secret)).toBe('5.6.7.8');
      expect(clientIp(req({ 'x-vercel-forwarded-for': '1.2.3.4' }), order, secret)).toBe('10.0.0.1');
    });

    it('behaves as before when no secret is configured', () => {
      expect(clientIp(req(sent()), order, undefined)).toBe('1.2.3.4');
      expect(clientIp(req(sent('anything')), order)).toBe('1.2.3.4');
    });
  });

  describe('IPv6', () => {
    it('groups the addresses of one /64, however they are written', () => {
      const of = (address: string) => clientIp(req({ 'true-client-ip': address }), order);
      expect(of('2001:db8:1:2::1')).toBe('2001:db8:1:2::/64');
      expect(of('2001:0DB8:0001:0002:ffff:ffff:ffff:ffff')).toBe('2001:db8:1:2::/64');
      expect(of('2001:db8:1:2:3:4:5:6')).toBe('2001:db8:1:2::/64');
      expect(of('2001:db8::1')).toBe('2001:db8:0:0::/64');
      expect(of('2001:db8:1:3::1')).toBe('2001:db8:1:3::/64');
      expect(clientIp(req({}, '2001:db8:1:2::9'), order)).toBe('2001:db8:1:2::/64');
    });

    it('reads an IPv4 address written as IPv6 as the IPv4 address, and leaves IPv4 as it is', () => {
      expect(clientIp(req({}, '::ffff:203.0.113.9'), order)).toBe('203.0.113.9');
      expect(clientIp(req({ 'true-client-ip': '::FFFF:198.51.100.1' }), order)).toBe('198.51.100.1');
      expect(clientIp(req({ 'true-client-ip': '198.51.100.1' }), order)).toBe('198.51.100.1');
    });
  });
});
