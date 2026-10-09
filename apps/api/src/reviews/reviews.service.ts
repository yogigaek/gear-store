import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  publicName,
  type MyReview,
  type ProductReviews,
  type Review,
  type ReviewInput,
} from '@gear-store/shared';
import { OrderStatus, type Prisma } from '../generated/prisma/client.js';
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

const PAID_STATUSES = [OrderStatus.PAID, OrderStatus.SHIPPED, OrderStatus.DELIVERED];

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
    const [user, review, bought] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { isDemo: true } }),
      this.prisma.review.findUnique({
        where: { userId_productId: { userId, productId: product.id } },
        select: reviewSelect,
      }),
      this.hasBought(userId, product.id),
    ]);
    const reason = user.isDemo ? 'DEMO_ACCOUNT' : bought ? null : 'NOT_PURCHASED';
    return { canReview: reason === null, reason, review: review ? toReview(review) : null };
  }

  async upsert(userId: string, slug: string, input: ReviewInput): Promise<Review> {
    const product = await this.activeProduct(slug);
    const mine = await this.mine(userId, slug);
    if (mine.reason === 'DEMO_ACCOUNT') throw new ForbiddenException('Demo accounts cannot post reviews');
    if (mine.reason === 'NOT_PURCHASED')
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
