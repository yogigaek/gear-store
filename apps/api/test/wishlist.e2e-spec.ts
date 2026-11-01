import type { INestApplication } from '@nestjs/common';
import { authResponseSchema, WISHLIST_LIMIT, wishlistSchema } from '@gear-store/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, FakeMail, nextIp, deleteTestUsers } from './setup.js';

// enough parts of our own to fill a wishlist and try a few more
const TEMP_PREFIX = `e2e-wish-${Date.now()}`;

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
    const prisma = app.get(PrismaService);
    const { id: categoryId } = await prisma.category.findUniqueOrThrow({ where: { slug: 'accessories' } });
    await prisma.product.createMany({
      data: Array.from({ length: WISHLIST_LIMIT + 3 }, (_, i) => ({
        slug: `${TEMP_PREFIX}-${String(i).padStart(3, '0')}`,
        name: `Wishlist Test ${i}`,
        model: 'WT-1',
        module: 'ACCESSORY' as const,
        description: 'Created by the wishlist e2e suite',
        price: 10000,
        stock: 5,
        categoryId,
      })),
    });
  });

  beforeEach(() => {
    ip = nextIp();
  });

  afterAll(async () => {
    await deleteTestUsers(app);
    await app.get(PrismaService).product.deleteMany({ where: { slug: { startsWith: TEMP_PREFIX } } });
    await app.close();
  });

  it('requires sign-in', async () => {
    await request(app.getHttpServer()).get('/api/me/wishlist').expect(401);
    await request(app.getHttpServer()).put('/api/me/wishlist/e1-frame-m').expect(401);
  });

  it('saves products newest first, idempotently, and removes them', async () => {
    const me = as(await signedInUser());
    await me.put('e1-frame-m').expect(204);
    await me.put('e1-battery-750').expect(204);
    await me.put('e1-frame-m').expect(204);
    const saved = wishlistSchema.parse((await me.list().expect(200)).body).map((p) => p.slug);
    expect(saved).toEqual(['e1-battery-750', 'e1-frame-m']);
    await me.del('e1-frame-m').expect(204);
    await me.del('e1-frame-m').expect(204);
    expect(wishlistSchema.parse((await me.list().expect(200)).body).map((p) => p.slug)).toEqual([
      'e1-battery-750',
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
    await ana.put('lights-front-rear').expect(204);
    expect((await budi.list().expect(200)).body).toEqual([]);
    await budi.del('lights-front-rear').expect(204);
    expect((await ana.list().expect(200)).body).toHaveLength(1);
  });

  it('keeps to the limit when products are saved at the same moment', async () => {
    const token = await signedInUser();
    const userId = (JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString()) as { sub: string })
      .sub;
    const prisma = app.get(PrismaService);
    const temps = await prisma.product.findMany({
      where: { slug: { startsWith: TEMP_PREFIX } },
      orderBy: { slug: 'asc' },
      select: { id: true, slug: true },
    });
    await prisma.wishlistItem.createMany({
      data: temps.slice(0, WISHLIST_LIMIT - 1).map((p) => ({ userId, productId: p.id })),
    });
    const me = as(token);
    const replies = await Promise.all(temps.slice(WISHLIST_LIMIT - 1).map((p) => me.put(p.slug)));
    expect(replies.map((r) => r.status).sort((a, b) => a - b)).toEqual([204, 409, 409, 409]);
    expect(await prisma.wishlistItem.count({ where: { userId } })).toBe(WISHLIST_LIMIT);
  });

  describe('edge cases', () => {
    const userIdOf = (token: string) =>
      (JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString()) as { sub: string }).sub;
    const temps = () =>
      app.get(PrismaService).product.findMany({
        where: { slug: { startsWith: TEMP_PREFIX } },
        orderBy: { slug: 'asc' },
        select: { id: true, slug: true },
      });

    it(`takes a ${WISHLIST_LIMIT}th product, refuses the next, and still accepts one already saved`, async () => {
      const token = await signedInUser();
      const prisma = app.get(PrismaService);
      const parts = await temps();
      await prisma.wishlistItem.createMany({
        data: parts.slice(0, WISHLIST_LIMIT - 1).map((p) => ({ userId: userIdOf(token), productId: p.id })),
      });
      const me = as(token);
      await me.put(parts[WISHLIST_LIMIT - 1]!.slug).expect(204);
      const refused = await me.put(parts[WISHLIST_LIMIT]!.slug).expect(409);
      expect(refused.body.message).toBe(`A wishlist holds up to ${WISHLIST_LIMIT} products`);
      await me.put(parts[0]!.slug).expect(204);
      expect(await prisma.wishlistItem.count({ where: { userId: userIdOf(token) } })).toBe(WISHLIST_LIMIT);
    });

    it('hides a saved product taken off sale but keeps it saved, and refuses to save one off sale', async () => {
      const token = await signedInUser();
      const me = as(token);
      const prisma = app.get(PrismaService);
      const [kept, other] = (await temps()).slice(-2);
      await me.put(kept!.slug).expect(204);
      await prisma.product.updateMany({
        where: { slug: { in: [kept!.slug, other!.slug] } },
        data: { isActive: false },
      });
      try {
        expect(wishlistSchema.parse((await me.list().expect(200)).body)).toEqual([]);
        await me.put(other!.slug).expect(404);
      } finally {
        await prisma.product.updateMany({
          where: { slug: { in: [kept!.slug, other!.slug] } },
          data: { isActive: true },
        });
      }
      expect(wishlistSchema.parse((await me.list().expect(200)).body).map((p) => p.slug)).toEqual([
        kept!.slug,
      ]);
    });

    it('removes a product that is not saved or not known without complaint, and refuses a malformed slug', async () => {
      const me = as(await signedInUser());
      await me.del('no-such-product').expect(204);
      await me.del('e1-frame-m').expect(204);
      await me.del('Bad%20Slug').expect(400);
      await me.del('x'.repeat(81)).expect(400);
      await request(app.getHttpServer()).delete('/api/me/wishlist/e1-frame-m').expect(401);
    });
  });
});
