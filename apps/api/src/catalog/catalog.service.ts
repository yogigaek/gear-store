import { Injectable, NotFoundException } from '@nestjs/common';
import type { Category, ProductDetail, ProductPage, ProductQuery, ProductSummary } from '@gear-store/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

const summarySelect = {
  slug: true,
  name: true,
  model: true,
  brand: true,
  price: true,
  stock: true,
  has3d: true,
  category: { select: { slug: true } },
  specs: { where: { onPlate: true }, orderBy: { position: 'asc' }, select: { label: true, value: true } },
} satisfies Prisma.ProductSelect;

type SummaryRow = Prisma.ProductGetPayload<{ select: typeof summarySelect }>;

const orderBy: Record<ProductQuery['sort'], Prisma.ProductOrderByWithRelationInput[]> = {
  newest: [{ createdAt: 'desc' }, { slug: 'asc' }],
  'price-asc': [{ price: 'asc' }, { slug: 'asc' }],
  'price-desc': [{ price: 'desc' }, { slug: 'asc' }],
  name: [{ name: 'asc' }, { slug: 'asc' }],
};

function toSummary(row: SummaryRow): ProductSummary {
  const { category, specs, ...rest } = row;
  return { ...rest, category: category.slug, plate: specs };
}

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
        _count: { select: { products: { where: { isActive: true } } } },
      },
    });
    return rows.map(({ _count, ...c }) => ({ ...c, productCount: _count.products }));
  }

  async products(query: ProductQuery): Promise<ProductPage> {
    const where: Prisma.ProductWhereInput = {
      isActive: true,
      ...(query.category && { category: { slug: query.category } }),
      ...(query.brand && { brand: { equals: query.brand, mode: 'insensitive' } }),
      ...(query.inStock === true && { stock: { gt: 0 } }),
      ...(query.inStock === false && { stock: 0 }),
      ...((query.minPrice !== undefined || query.maxPrice !== undefined) && {
        price: { gte: query.minPrice, lte: query.maxPrice },
      }),
      ...(query.q && {
        OR: (['name', 'model', 'brand'] as const).map((field) => ({
          [field]: { contains: query.q, mode: 'insensitive' as const },
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
