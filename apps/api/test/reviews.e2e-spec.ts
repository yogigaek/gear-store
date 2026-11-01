import { Logger, type INestApplication } from '@nestjs/common';
import {
  addressSchema,
  authResponseSchema,
  myReviewSchema,
  orderDetailSchema,
  productReviewsSchema,
  reviewSchema,
} from '@gear-store/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { Prisma } from '../src/generated/prisma/client.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, deleteTestUsers, FakeMail, nextIp, signedInCustomer } from './setup.js';

const SLUG = 'workshop-hex-set';
const REVIEW = {
  rating: 4,
  title: 'Crisp legends',
  body: 'Thick PBT, no shine after a month of daily typing.',
};

describe('Reviews (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const mail = new FakeMail();

  function as(token: string) {
    // each request from its own address, so the suite stays clear of the per-client rate limits
    const auth = () => ({ Authorization: `Bearer ${token}`, 'X-Forwarded-For': nextIp() });
    const server = () => app.getHttpServer();
    return {
      token,
      mine: () => request(server()).get(`/api/me/reviews/${SLUG}`).set(auth()),
      put: (body: object) => request(server()).put(`/api/me/reviews/${SLUG}`).set(auth()).send(body),
      del: () => request(server()).delete(`/api/me/reviews/${SLUG}`).set(auth()),
      async buy(paid: boolean) {
        const address = addressSchema.parse(
          (
            await request(server()).post('/api/me/addresses').set(auth()).send({
              recipient: 'Ana',
              phone: '081234567890',
              line1: 'Jl. Merdeka 10',
              city: 'Bandung',
              province: 'Jawa Barat',
              postalCode: '40111',
            })
          ).body,
        );
        await request(server())
          .put('/api/me/cart/items')
          .set(auth())
          .send({ slug: SLUG, quantity: 1 })
          .expect(200);
        const order = orderDetailSchema.parse(
          (
            await request(server())
              .post('/api/me/orders')
              .set(auth())
              .send({ addressId: address.id, idempotencyKey: randomUUID() })
              .expect(201)
          ).body,
        );
        // the payment path has its own tests; here only the outcome matters
        if (paid)
          await prisma.order.update({
            where: { number: order.number },
            data: { status: 'PAID', paidAt: new Date() },
          });
        return order;
      },
    };
  }

  const reviews = async () =>
    productReviewsSchema.parse(
      (await request(app.getHttpServer()).get(`/api/products/${SLUG}/reviews`).expect(200)).body,
    );

  beforeAll(async () => {
    app = await createTestApp({ mail });
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await deleteTestUsers(app);
    await app.close();
  });

  it('lets only buyers with a paid order review, one review each, editable', async () => {
    const me = as(await signedInCustomer(app, mail, nextIp()));
    expect(myReviewSchema.parse((await me.mine().expect(200)).body)).toMatchObject({
      canReview: false,
      reason: 'NOT_PURCHASED',
    });
    await me.put(REVIEW).expect(403);

    await me.buy(false); // placed but unpaid: still not a buyer
    await me.put(REVIEW).expect(403);

    await me.buy(true);
    expect(myReviewSchema.parse((await me.mine().expect(200)).body)).toMatchObject({
      canReview: true,
      reason: null,
      review: null,
    });
    await me.put(REVIEW).expect(200);
    await me.put({ ...REVIEW, rating: 5, title: 'Even better after a week' }).expect(200);

    const mine = myReviewSchema.parse((await me.mine().expect(200)).body);
    expect(mine.review).toMatchObject({ rating: 5, title: 'Even better after a week', author: 'Test' });
    const list = await reviews();
    expect(list.items.filter((r) => r.id === mine.review!.id)).toHaveLength(1);

    await me.del().expect(204);
    expect(myReviewSchema.parse((await me.mine().expect(200)).body).review).toBeNull();
  });

  it('averages to one decimal and counts each star', async () => {
    const before = await reviews();
    const ratings = [5, 4, 4];
    for (const rating of ratings) {
      const buyer = as(await signedInCustomer(app, mail, nextIp()));
      await buyer.buy(true);
      await buyer.put({ ...REVIEW, rating }).expect(200);
    }
    const after = await reviews();
    expect(after.count).toBe(before.count + 3);
    expect(after.distribution[0]).toBe(before.distribution[0] + 1);
    expect(after.distribution[1]).toBe(before.distribution[1] + 2);
    if (before.count === 0) expect(after.average).toBe(4.3);
  });

  it('keeps shared demo accounts from posting', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/demo')
      .set('X-Forwarded-For', nextIp())
      .send({ role: 'shopper' });
    const demo = as(authResponseSchema.parse(res.body).accessToken);
    expect(myReviewSchema.parse((await demo.mine().expect(200)).body).reason).toBe('DEMO_ACCOUNT');
    await demo.put(REVIEW).expect(403);
  });

  it('validates the review and the product', async () => {
    const me = as(await signedInCustomer(app, mail, nextIp()));
    const res = await me.put({ rating: 6, title: '', body: 'short' }).expect(400);
    expect(res.body.issues.map((i: { path: string }) => i.path).sort()).toEqual(['body', 'rating', 'title']);
    await request(app.getHttpServer()).get('/api/products/no-such-product/reviews').expect(404);
    await request(app.getHttpServer()).get(`/api/me/reviews/${SLUG}`).expect(401);
  });

  describe('edge cases', () => {
    const buyer = async () => {
      const me = as(await signedInCustomer(app, mail, nextIp()));
      await me.buy(true);
      return me;
    };

    it('takes ratings 1 to 5, titles up to 80 and bodies of 10 to 2000 characters, trimmed', async () => {
      const me = await buyer();
      for (const rating of [1, 5]) await me.put({ ...REVIEW, rating }).expect(200);
      const longest = { rating: 3, title: `  ${'t'.repeat(80)}  `, body: ` ${'b'.repeat(2000)} ` };
      const saved = reviewSchema.parse((await me.put(longest).expect(200)).body);
      expect([saved.title.length, saved.body.length]).toEqual([80, 2000]);
      await me.put({ ...REVIEW, body: 'b'.repeat(10) }).expect(200);
      const refused: [string, object][] = [
        ['rating', { rating: 0 }],
        ['rating', { rating: 6 }],
        ['rating', { rating: 4.5 }],
        ['rating', { rating: '5' }],
        ['title', { title: 't'.repeat(81) }],
        ['title', { title: '   ' }],
        ['body', { body: 'b'.repeat(9) }],
        ['body', { body: 'b'.repeat(2001) }],
      ];
      for (const [path, change] of refused) {
        const res = await me.put({ ...REVIEW, ...change }).expect(400);
        expect(res.body.issues.map((i: { path: string }) => i.path)).toEqual([path]);
      }
      expect(myReviewSchema.parse((await me.mine().expect(200)).body).review?.body).toBe('b'.repeat(10));
    });

    it('counts a shipped or delivered order as bought, and a cancelled one as not', async () => {
      const shipped = as(await signedInCustomer(app, mail, nextIp()));
      const order = await shipped.buy(true);
      await prisma.order.update({ where: { number: order.number }, data: { status: 'DELIVERED' } });
      await shipped.put(REVIEW).expect(200);

      const cancelled = as(await signedInCustomer(app, mail, nextIp()));
      const unpaid = await cancelled.buy(false);
      await request(app.getHttpServer())
        .post(`/api/me/orders/${unpaid.number}/cancel`)
        .set('Authorization', `Bearer ${cancelled.token}`)
        .expect(200);
      expect(myReviewSchema.parse((await cancelled.mine().expect(200)).body).reason).toBe('NOT_PURCHASED');
      await cancelled.put(REVIEW).expect(403);
    });

    it('keeps one review per account when the same review is posted twice at once', async () => {
      const me = await buyer();
      const replies = await Promise.all([me.put(REVIEW), me.put({ ...REVIEW, rating: 5 })]);
      expect(replies.map((r) => r.status)).toEqual([200, 200]);
      const { id: productId } = await prisma.product.findUniqueOrThrow({ where: { slug: SLUG } });
      const userId = (await prisma.review.findFirstOrThrow({ where: { id: replies[0]!.body.id } })).userId;
      expect(await prisma.review.count({ where: { userId, productId } })).toBe(1);
    });

    it('saves the review when its first write loses a create race to another post', async () => {
      const me = await buyer();
      const clash = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: Prisma.prismaVersion.client,
        meta: { modelName: 'Review' },
      });
      const upsert = vi.spyOn(prisma.review, 'upsert').mockRejectedValueOnce(clash);
      let saved;
      let writes;
      try {
        saved = reviewSchema.parse((await me.put(REVIEW).expect(200)).body);
        writes = upsert.mock.calls.length;
      } finally {
        upsert.mockRestore();
      }
      expect(writes).toBe(2);
      const { userId } = await prisma.review.findUniqueOrThrow({ where: { id: saved.id } });
      const { id: productId } = await prisma.product.findUniqueOrThrow({ where: { slug: SLUG } });
      expect(await prisma.review.findMany({ where: { userId, productId } })).toEqual([
        expect.objectContaining({ id: saved.id, title: REVIEW.title, rating: REVIEW.rating }),
      ]);
    });

    it('removes only the account’s own review, and answers a delete with none without complaint', async () => {
      const author = await buyer();
      const review = reviewSchema.parse((await author.put(REVIEW).expect(200)).body);
      const other = as(await signedInCustomer(app, mail, nextIp()));
      await other.del().expect(204);
      await other.put({ ...REVIEW, title: 'Overwritten' }).expect(403);
      expect(myReviewSchema.parse((await author.mine().expect(200)).body).review).toMatchObject({
        id: review.id,
        title: REVIEW.title,
      });
    });

    it('answers 404 for a part taken off sale: its reviews, the form and the post', async () => {
      const me = await buyer();
      await me.put(REVIEW).expect(200);
      await prisma.product.update({ where: { slug: SLUG }, data: { isActive: false } });
      try {
        await request(app.getHttpServer()).get(`/api/products/${SLUG}/reviews`).expect(404);
        await me.mine().expect(404);
        await me.put(REVIEW).expect(404);
        await me.del().expect(404);
      } finally {
        await prisma.product.update({ where: { slug: SLUG }, data: { isActive: true } });
      }
      expect(myReviewSchema.parse((await me.mine().expect(200)).body).review).not.toBeNull();
    });

    it('answers a database failure while saving a review with a bare 500, and saves nothing', async () => {
      const me = await buyer();
      const upsert = vi.spyOn(prisma.review, 'upsert').mockRejectedValueOnce(new Error('connection reset'));
      const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      try {
        expect((await me.put(REVIEW).expect(500)).body).toEqual({
          statusCode: 500,
          message: 'Internal server error',
        });
      } finally {
        upsert.mockRestore();
        logged.mockRestore();
      }
      expect(myReviewSchema.parse((await me.mine().expect(200)).body).review).toBeNull();
    });

    it('keeps markup in a review exactly as typed, for the page to escape', async () => {
      const me = await buyer();
      const hostile = {
        ...REVIEW,
        title: '<script>alert(1)</script>',
        body: `<img src=x onerror=alert(1)> '; --`,
      };
      const saved = reviewSchema.parse((await me.put(hostile).expect(200)).body);
      expect(saved).toMatchObject({ title: hostile.title, body: hostile.body });
    });

    it('refuses a malformed slug and every account route without a token', async () => {
      const me = await buyer();
      await request(app.getHttpServer())
        .get('/api/me/reviews/Bad%20Slug')
        .set('Authorization', `Bearer ${me.token}`)
        .expect(400);
      const server = () => request(app.getHttpServer());
      await server().put(`/api/me/reviews/${SLUG}`).send(REVIEW).expect(401);
      await server().delete(`/api/me/reviews/${SLUG}`).expect(401);
    });
  });
});
