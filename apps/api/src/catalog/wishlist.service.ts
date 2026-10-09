import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { WISHLIST_LIMIT, type Wishlist } from '@gear-store/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { summarySelect, toSummary } from './catalog.service.js';

@Injectable()
export class WishlistService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<Wishlist> {
    const rows = await this.prisma.wishlistItem.findMany({
      // a product taken off sale disappears from the list but stays saved, in case it returns
      where: { userId, product: { isActive: true } },
      orderBy: { createdAt: 'desc' },
      select: { product: { select: summarySelect } },
    });
    return rows.map((r) => toSummary(r.product));
  }

  /** PUT semantics: saving an already saved product changes nothing. */
  async add(userId: string, slug: string): Promise<void> {
    const product = await this.prisma.product.findFirst({
      where: { slug, isActive: true },
      select: { id: true },
    });
    if (!product) throw new NotFoundException('Product not found');
    const key = { userId_productId: { userId, productId: product.id } };
    if (await this.prisma.wishlistItem.findUnique({ where: key })) return;
    if ((await this.prisma.wishlistItem.count({ where: { userId } })) >= WISHLIST_LIMIT) {
      throw new ConflictException(`A wishlist holds up to ${WISHLIST_LIMIT} products`);
    }
    await this.prisma.wishlistItem.upsert({
      where: key,
      create: { userId, productId: product.id },
      update: {},
    });
  }

  async remove(userId: string, slug: string): Promise<void> {
    await this.prisma.wishlistItem.deleteMany({ where: { userId, product: { slug } } });
  }
}
