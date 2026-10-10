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
});
