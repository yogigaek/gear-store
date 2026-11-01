import { Injectable, NotFoundException } from '@nestjs/common';
import type { Category, ProductDetail, ProductPage, ProductQuery } from '@gear-store/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { literal } from '../prisma/like.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { summarySelect, toSummary } from './product.projection.js';

const orderBy: Record<ProductQuery['sort'], Prisma.ProductOrderByWithRelationInput[]> = {
  type: [{ category: { sortOrder: 'asc' } }, { price: 'asc' }, { createdAt: 'asc' }, { slug: 'asc' }],
  'price-asc': [{ price: 'asc' }, { slug: 'asc' }],
  'price-desc': [{ price: 'desc' }, { slug: 'asc' }],
  name: [{ name: 'asc' }, { slug: 'asc' }],
};

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async categories(): Promise<Category[]> {
    const rows = await this.prisma.category.findMany({
      orderBy: { sortOrder: 'asc' },
      select: {
        slug: true,
        name: true,
        description: true,
        slot: true,
        _count: { select: { products: { where: { isActive: true } } } },
      },
    });
    return rows.map(({ _count, ...c }) => ({ ...c, productCount: _count.products }));
  }

  async products(query: ProductQuery): Promise<ProductPage> {
    const { q } = query;
    const where: Prisma.ProductWhereInput = {
      isActive: true,
      ...(query.category && { category: { slug: query.category } }),
      ...(query.inStock === true && { stock: { gt: 0 } }),
      ...(query.inStock === false && { stock: 0 }),
      ...((query.minPrice !== undefined || query.maxPrice !== undefined) && {
        price: { gte: query.minPrice, lte: query.maxPrice },
      }),
      ...(q && {
        OR: (['name', 'model'] as const).map((field) => ({
          [field]: { contains: literal(q), mode: 'insensitive' as const },
        })),
      }),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        select: summarySelect,
        orderBy: orderBy[query.sort],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.product.count({ where }),
    ]);
    return { items: rows.map(toSummary), page: query.page, pageSize: query.pageSize, total };
  }

  async product(slug: string): Promise<ProductDetail> {
    const row = await this.prisma.product.findFirst({
      where: { slug, isActive: true },
      select: {
        ...summarySelect,
        description: true,
        specs: { orderBy: { position: 'asc' }, select: { label: true, value: true, onPlate: true } },
        colors: { orderBy: { position: 'asc' }, select: { key: true, label: true, hex: true } },
      },
    });
    if (!row) throw new NotFoundException('Product not found');
    const { category, specs, ...rest } = row;
    return {
      ...rest,
      category: category.slug,
      plate: specs.filter((s) => s.onPlate).map(({ label, value }) => ({ label, value })),
      specs: specs.map(({ label, value }) => ({ label, value })),
    };
  }
}
