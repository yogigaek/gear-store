import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { createTestApp } from './setup.js';

// Production reads the visitor address from headers the hosting sets (Vercel, Cloudflare), never from the
// X-Forwarded-For list a visitor can write into.
describe('Rate limits by the hosting-provided client address (e2e)', () => {
  let app: INestApplication<App>;
  const previous = process.env['CLIENT_IP_HEADERS'];

  beforeAll(async () => {
    process.env['CLIENT_IP_HEADERS'] = 'x-vercel-forwarded-for,true-client-ip';
    app = await createTestApp();
  });

  afterAll(async () => {
    if (previous === undefined) delete process.env['CLIENT_IP_HEADERS'];
    else process.env['CLIENT_IP_HEADERS'] = previous;
    await app.close();
  });

  const attempt = (headers: Record<string, string>) =>
    request(app.getHttpServer())
      .post('/api/auth/login')
      .set(headers)
      .send({ email: `nobody-${Math.random()}@test.example`, password: 'wrong' });

  it('counts one visitor once, whatever X-Forwarded-For they send', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      const res = await attempt({
        'x-vercel-forwarded-for': '198.51.100.7',
        'x-forwarded-for': `203.0.113.${i}`,
      });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(statuses[5]).toBe(429);
  });

  it('keeps different visitors apart', async () => {
    for (let i = 0; i < 6; i += 1) {
      const res = await attempt({ 'true-client-ip': `198.51.100.${100 + i}` });
      expect(res.status).toBe(401);
    }
  });
});
