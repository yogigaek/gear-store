import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, deleteTestUsers, FakeMail, signedInCustomer } from './setup.js';

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
    // sign-in allows 10 requests a minute per visitor; a fresh X-Forwarded-For each time must not reset it
    const statuses: number[] = [];
    for (let i = 0; i < 11; i += 1) {
      const res = await attempt({
        'x-vercel-forwarded-for': '198.51.100.7',
        'x-forwarded-for': `203.0.113.${i}`,
      });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses[10]).toBe(429);
  });

  it('keeps different visitors apart', async () => {
    for (let i = 0; i < 11; i += 1) {
      const res = await attempt({ 'true-client-ip': `198.51.100.${100 + i}` });
      expect(res.status).toBe(401);
    }
  });
});

// The web app's proxy (Vercel) adds a shared secret to every /api request it forwards; only then is its
// x-vercel-forwarded-for believed. Anyone can call the API host directly and write that header themselves.
describe('Client address behind the web proxy’s secret (e2e)', () => {
  let app: INestApplication<App>;
  const mail = new FakeMail();
  const SECRET = 'e2e-proxy-secret-0123456789abcdefghijklmnop';
  const previous = {
    headers: process.env['CLIENT_IP_HEADERS'],
    secret: process.env['PROXY_SECRET'],
  };
  const restore = (name: string, value: string | undefined) => {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  };

  beforeAll(async () => {
    process.env['CLIENT_IP_HEADERS'] = 'x-vercel-forwarded-for,true-client-ip';
    process.env['PROXY_SECRET'] = SECRET;
    app = await createTestApp({ mail });
  });

  afterAll(async () => {
    await deleteTestUsers(app);
    restore('CLIENT_IP_HEADERS', previous.headers);
    restore('PROXY_SECRET', previous.secret);
    await app.close();
  });

  it('reads x-vercel-forwarded-for only from requests that carry the secret', async () => {
    const token = await signedInCustomer(app, mail, '198.51.100.30');
    const prisma = app.get(PrismaService);
    const { id } = (await request(app.getHttpServer()).get('/api/me').set('Authorization', `Bearer ${token}`))
      .body as { id: string };
    await prisma.user.update({ where: { id }, data: { role: 'ADMIN' } });
    const info = async (headers: Record<string, string>) =>
      (
        await request(app.getHttpServer())
          .get('/api/admin/request-info')
          .set('Authorization', `Bearer ${token}`)
          .set(headers)
          .expect(200)
      ).body as { clientIp: string };
    const spoofed = { 'x-vercel-forwarded-for': '203.0.113.50', 'true-client-ip': '198.51.100.60' };
    expect((await info({ ...spoofed, 'x-rakit-proxy': SECRET })).clientIp).toBe('203.0.113.50');
    expect((await info(spoofed)).clientIp).toBe('198.51.100.60');
    expect((await info({ ...spoofed, 'x-rakit-proxy': 'guessed' })).clientIp).toBe('198.51.100.60');
  });

  it('counts a direct caller once, however it rotates x-vercel-forwarded-for', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 11; i += 1) {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .set({ 'x-vercel-forwarded-for': `203.0.113.${100 + i}`, 'true-client-ip': '198.51.100.70' })
        .send({ email: `nobody-${Math.random()}@test.example`, password: 'wrong' });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});
