import type { INestApplication } from '@nestjs/common';
import { authResponseSchema, wishlistSchema } from '@gear-store/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { createTestApp, FakeMail, nextIp, deleteTestUsers } from './setup.js';

describe('Wishlist (e2e)', () => {
  let app: INestApplication<App>;
  const mail = new FakeMail();
  let ip: string;

  async function signedInUser(): Promise<string> {
    const email = `wish-${randomUUID()}@test.example`;
    const password = 'correct horse battery';
    const server = app.getHttpServer();
    await request(server)
      .post('/api/auth/register')
      .set('X-Forwarded-For', ip)
      .send({ name: 'W', email, password });
    await request(server)
      .post('/api/auth/verify-email')
      .set('X-Forwarded-For', ip)
      .send({ token: mail.lastToken(email) });
    const res = await request(server)
      .post('/api/auth/login')
      .set('X-Forwarded-For', ip)
      .send({ email, password });
    return authResponseSchema.parse(res.body).accessToken;
  }

  const as = (token: string) => ({
    list: () => request(app.getHttpServer()).get('/api/me/wishlist').set('Authorization', `Bearer ${token}`),
    put: (slug: string) =>
      request(app.getHttpServer()).put(`/api/me/wishlist/${slug}`).set('Authorization', `Bearer ${token}`),
    del: (slug: string) =>
      request(app.getHttpServer()).delete(`/api/me/wishlist/${slug}`).set('Authorization', `Bearer ${token}`),
  });

  beforeAll(async () => {
    app = await createTestApp({ mail });
  });

  beforeEach(() => {
    ip = nextIp();
  });

  afterAll(async () => {
    await deleteTestUsers(app);
    await app.close();
  });

  it('requires sign-in', async () => {
    await request(app.getHttpServer()).get('/api/me/wishlist').expect(401);
    await request(app.getHttpServer()).put('/api/me/wishlist/h-40-anc-headphone').expect(401);
  });

  it('saves products newest first, idempotently, and removes them', async () => {
    const me = as(await signedInUser());
    await me.put('h-40-anc-headphone').expect(204);
    await me.put('k-75-mechanical-keyboard').expect(204);
    await me.put('h-40-anc-headphone').expect(204);
    const saved = wishlistSchema.parse((await me.list().expect(200)).body).map((p) => p.slug);
    expect(saved).toEqual(['k-75-mechanical-keyboard', 'h-40-anc-headphone']);
    await me.del('h-40-anc-headphone').expect(204);
    await me.del('h-40-anc-headphone').expect(204);
    expect(wishlistSchema.parse((await me.list().expect(200)).body).map((p) => p.slug)).toEqual([
      'k-75-mechanical-keyboard',
    ]);
  });

  it('answers 404 for an unknown product and 400 for a malformed slug', async () => {
    const me = as(await signedInUser());
    await me.put('no-such-product').expect(404);
    await me.put('Not%20A%20Slug').expect(400);
  });

  it('keeps each account’s list to itself', async () => {
    const ana = as(await signedInUser());
    const budi = as(await signedInUser());
    await ana.put('p-20-power-bank').expect(204);
    expect((await budi.list().expect(200)).body).toEqual([]);
    await budi.del('p-20-power-bank').expect(204);
    expect((await ana.list().expect(200)).body).toHaveLength(1);
  });
});
