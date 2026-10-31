import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  publicName,
  type MyReview,
  type ProductReviews,
  type Review,
  type ReviewInput,
} from '@gear-store/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { PAID_STATUSES } from '../orders/order-status.js';
import { PrismaService } from '../prisma/prisma.service.js';

const reviewSelect = {
  id: true,
  rating: true,
  title: true,
  body: true,
  createdAt: true,
  updatedAt: true,
  user: { select: { name: true } },
} satisfies Prisma.ReviewSelect;

type ReviewRow = Prisma.ReviewGetPayload<{ select: typeof reviewSelect }>;

function toReview(r: ReviewRow): Review {
  return {
    id: r.id,
    author: publicName(r.user.name),
    rating: r.rating,
    title: r.title,
    body: r.body,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async forProduct(slug: string): Promise<ProductReviews> {
    const product = await this.activeProduct(slug);
    const [items, grouped] = await Promise.all([
      this.prisma.review.findMany({
        where: { productId: product.id },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: reviewSelect,
      }),
      this.prisma.review.groupBy({
        by: ['rating'],
        where: { productId: product.id },
        _count: { _all: true },
      }),
    ]);
    const counts = new Map(grouped.map((g) => [g.rating, g._count._all]));
    const count = grouped.reduce((sum, g) => sum + g._count._all, 0);
    const total = grouped.reduce((sum, g) => sum + g.rating * g._count._all, 0);
    return {
      // one decimal, as shown on the page; null rather than 0 when nobody has reviewed yet
      average: count ? Math.round((total / count) * 10) / 10 : null,
      count,
      distribution: [5, 4, 3, 2, 1].map((star) => counts.get(star) ?? 0) as ProductReviews['distribution'],
      items: items.map(toReview),
    };
  }

  async mine(userId: string, slug: string): Promise<MyReview> {
    const product = await this.activeProduct(slug);
    const [reason, review] = await Promise.all([
      this.whyNot(userId, product.id),
      this.prisma.review.findUnique({
        where: { userId_productId: { userId, productId: product.id } },
        select: reviewSelect,
      }),
    ]);
    return { canReview: reason === null, reason, review: review ? toReview(review) : null };
  }

  async upsert(userId: string, slug: string, input: ReviewInput): Promise<Review> {
    const product = await this.activeProduct(slug);
    const reason = await this.whyNot(userId, product.id);
    if (reason === 'DEMO_ACCOUNT') throw new ForbiddenException('Demo accounts cannot post reviews');
    if (reason === 'NOT_PURCHASED')
      throw new ForbiddenException('Only customers who bought this product can review it');
    const row = await this.prisma.review.upsert({
      where: { userId_productId: { userId, productId: product.id } },
      create: { userId, productId: product.id, ...input },
      update: input,
      select: reviewSelect,
    });
    return toReview(row);
  }

  async remove(userId: string, slug: string): Promise<void> {
    const product = await this.activeProduct(slug);
    await this.prisma.review.deleteMany({ where: { userId, productId: product.id } });
  }

  /** Why this customer may not review the product, or null when they may. */
  private async whyNot(userId: string, productId: string): Promise<MyReview['reason']> {
    const [user, bought] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { isDemo: true } }),
      this.hasBought(userId, productId),
    ]);
    return user.isDemo ? 'DEMO_ACCOUNT' : bought ? null : 'NOT_PURCHASED';
  }

  private hasBought(userId: string, productId: string): Promise<boolean> {
    return this.prisma.orderItem
      .count({ where: { productId, order: { userId, status: { in: PAID_STATUSES } } }, take: 1 })
      .then((n) => n > 0);
  }

  private async activeProduct(slug: string) {
    const product = await this.prisma.product.findFirst({
      where: { slug, isActive: true },
      select: { id: true },
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }
}
