import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  AdminCategory,
  AdminCategoryInput,
  AdminListQuery,
  AdminProduct,
  AdminProductInput,
  AdminProductRow,
  AdminProductUpdate,
  PartModule,
} from '@gear-store/shared';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

const productInclude = {
  category: { select: { slug: true } },
  specs: { orderBy: { position: 'asc' } },
  colors: { orderBy: { position: 'asc' } },
} satisfies Prisma.ProductInclude;

type ProductRow = Prisma.ProductGetPayload<{ include: typeof productInclude }>;

function toAdminProduct(p: ProductRow): AdminProduct {
  return {
    slug: p.slug,
    name: p.name,
    model: p.model,
    category: p.category.slug,
    module: p.module,
    description: p.description,
    price: p.price,
    stock: p.stock,
    isActive: p.isActive,
    specs: p.specs.map(({ label, value }) => ({ label, value })),
    colors: p.colors.map(({ key, label, hex }) => ({ key, label, hex })),
    updatedAt: p.updatedAt.toISOString(),
  };
}

const isUniqueViolation = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

@Injectable()
export class AdminCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async products(query: AdminListQuery & { category?: string }) {
    const where: Prisma.ProductWhereInput = {
      ...(query.q && {
        OR: (['name', 'model', 'slug'] as const).map((f) => ({
          [f]: { contains: query.q, mode: 'insensitive' as const },
        })),
      }),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        include: { category: { select: { slug: true } } },
        orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.product.count({ where }),
    ]);
    const items: AdminProductRow[] = rows.map((p) => ({
      slug: p.slug,
      name: p.name,
      model: p.model,
      category: p.category.slug,
      module: p.module,
      price: p.price,
      stock: p.stock,
      isActive: p.isActive,
      updatedAt: p.updatedAt.toISOString(),
    }));
    return { items, page: query.page, pageSize: query.pageSize, total };
  }

  async product(slug: string): Promise<AdminProduct> {
    const p = await this.prisma.product.findUnique({ where: { slug }, include: productInclude });
    if (!p) throw new NotFoundException('Part not found');
    return toAdminProduct(p);
  }

  async createProduct(input: AdminProductInput): Promise<AdminProduct> {
    const categoryId = await this.categoryId(input.category, input.module);
    try {
      const created = await this.prisma.product.create({
        data: {
          ...this.fields(input, categoryId),
          slug: input.slug,
          specs: { create: this.specs(input) },
          colors: { create: this.colors(input) },
        },
        include: productInclude,
      });
      return toAdminProduct(created);
    } catch (error) {
      if (isUniqueViolation(error))
        throw new ConflictException(`A part with the slug "${input.slug}" exists`);
      throw error;
    }
  }

  /** Replaces the product. Refused if it changed since the form was opened (an order may have taken stock). */
  async updateProduct(slug: string, input: AdminProductUpdate): Promise<AdminProduct> {
    if (input.slug !== slug) throw new BadRequestException('The slug cannot change: links and orders use it');
    const categoryId = await this.categoryId(input.category, input.module, slug);
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.product.findUnique({ where: { slug }, select: { id: true } });
      if (!current) throw new NotFoundException('Part not found');
      const moved = await tx.product.updateMany({
        where: { id: current.id, updatedAt: new Date(input.expectedUpdatedAt) },
        data: this.fields(input, categoryId),
      });
      if (moved.count === 0) {
        throw new ConflictException(
          'This product changed after you opened it (stock may have sold). Reload and try again.',
        );
      }
      await tx.productSpec.deleteMany({ where: { productId: current.id } });
      await tx.productColor.deleteMany({ where: { productId: current.id } });
      await tx.productSpec.createMany({
        data: this.specs(input).map((s) => ({ ...s, productId: current.id })),
      });
      await tx.productColor.createMany({
        data: this.colors(input).map((c) => ({ ...c, productId: current.id })),
      });
      return toAdminProduct(
        await tx.product.findUniqueOrThrow({ where: { id: current.id }, include: productInclude }),
      );
    });
  }

  async categories(): Promise<AdminCategory[]> {
    const rows = await this.prisma.category.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { products: { select: { isActive: true } } },
    });
    return rows.map(({ products, id: _id, ...c }) => ({
      ...c,
      productCount: products.length,
      activeCount: products.filter((p) => p.isActive).length,
    }));
  }

  async createCategory(input: AdminCategoryInput): Promise<AdminCategory> {
    try {
      await this.prisma.category.create({ data: input });
    } catch (error) {
      if (isUniqueViolation(error))
        throw new ConflictException(`The slug "${input.slug}" or that build slot is already taken`);
      throw error;
    }
    return this.category(input.slug);
  }

  async updateCategory(slug: string, input: AdminCategoryInput): Promise<AdminCategory> {
    if (input.slug !== slug) throw new BadRequestException('The slug cannot change: links use it');
    let updated: { count: number };
    try {
      updated = await this.prisma.category.updateMany({ where: { slug }, data: input });
    } catch (error) {
      if (isUniqueViolation(error))
        throw new ConflictException('Another part type already holds that build slot');
      throw error;
    }
    if (updated.count === 0) throw new NotFoundException('Category not found');
    return this.category(slug);
  }

  /** Only an empty category can go; products are never deleted, only taken off sale. */
  async deleteCategory(slug: string): Promise<void> {
    const category = await this.prisma.category.findUnique({
      where: { slug },
      include: { _count: { select: { products: true } } },
    });
    if (!category) throw new NotFoundException('Category not found');
    if (category._count.products > 0)
      throw new ConflictException('Move or retire its products before deleting a category');
    await this.prisma.category.delete({ where: { slug } });
  }

  private async category(slug: string): Promise<AdminCategory> {
    const found = (await this.categories()).find((c) => c.slug === slug);
    if (!found) throw new NotFoundException('Category not found');
    return found;
  }

  /**
   * The category's id, once the part's 3D module fits it: an accessory category takes accessories, and a build
   * slot takes one module only (the build reads the bike's colour from the FRAME part, so a frame drawn as
   * anything else would lose it). `except` is the part being edited, which may be the one that set the module.
   */
  private async categoryId(slug: string, module: PartModule, except?: string): Promise<string> {
    const category = await this.prisma.category.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slot: true,
        products: { where: { slug: { not: except } }, select: { module: true }, take: 1 },
      },
    });
    const invalid = (path: 'category' | 'module', message: string) =>
      new BadRequestException({ statusCode: 400, message: 'Validation failed', issues: [{ path, message }] });
    if (!category) throw invalid('category', 'Unknown category');
    if (category.slot === null && module !== 'ACCESSORY')
      throw invalid('module', `${category.name} are accessories: choose the Accessory module`);
    if (category.slot !== null && module === 'ACCESSORY')
      throw invalid('module', `${category.name} go on the bike: choose the module that draws them`);
    const sibling = category.products[0]?.module;
    if (category.slot !== null && sibling && sibling !== module)
      throw invalid('module', `${category.name} are drawn as ${sibling.toLowerCase()} parts`);
    return category.id;
  }

  private fields(input: AdminProductInput, categoryId: string) {
    return {
      name: input.name,
      model: input.model,
      module: input.module,
      description: input.description,
      price: input.price,
      stock: input.stock,
      isActive: input.isActive,
      categoryId,
    };
  }

  private specs(input: AdminProductInput) {
    return input.specs.map((s, position) => ({ ...s, position, onPlate: position < 3 }));
  }

  private colors(input: AdminProductInput) {
    return input.colors.map((c, position) => ({ ...c, hex: c.hex.toLowerCase(), position }));
  }
}
