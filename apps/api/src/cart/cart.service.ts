import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  MAX_CART_LINES,
  MAX_LINE_QUANTITY,
  type Cart,
  type CartLine,
  type CartLineInput,
} from '@gear-store/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { summarySelect, toSummary } from '../catalog/catalog.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

const productSelect = {
  ...summarySelect,
  id: true,
  isActive: true,
  colors: { orderBy: { position: 'asc' }, select: { key: true, label: true } },
} satisfies Prisma.ProductSelect;

type ProductRow = Prisma.ProductGetPayload<{ select: typeof productSelect }>;

interface Line {
  product: ProductRow;
  colorKey: string;
  quantity: number;
}

/**
 * Prices and stock always come from the database at the moment of asking. The browser only ever sends
 * which products and how many; whatever price it might send is never read.
 */
@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  /** A cart for lines the browser holds (guests). Unknown or withdrawn products are dropped. */
  async quote(lines: CartLineInput[]): Promise<Cart> {
    return this.toCart(await this.resolve(lines));
  }

  async get(userId: string): Promise<Cart> {
    const rows = await this.prisma.cartItem.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: { colorKey: true, quantity: true, product: { select: productSelect } },
    });
    return this.toCart(
      rows
        .filter((r) => r.product.isActive)
        .map((r) => ({ ...r, colorKey: this.finish(r.product, r.colorKey) })),
    );
  }

  /** Sets one line to an exact quantity; 0 removes it. */
  async setLine(userId: string, input: CartLineInput): Promise<Cart> {
    const product = await this.prisma.product.findFirst({
      where: { slug: input.slug, isActive: true },
      select: productSelect,
    });
    if (!product) throw new NotFoundException('Product not found');
    const colorKey = this.finish(product, input.colorKey);
    const key = { userId_productId_colorKey: { userId, productId: product.id, colorKey } };

    if (input.quantity === 0) {
      await this.prisma.cartItem.deleteMany({ where: key.userId_productId_colorKey });
    } else {
      const exists = await this.prisma.cartItem.findUnique({ where: key, select: { id: true } });
      if (!exists && (await this.prisma.cartItem.count({ where: { userId } })) >= MAX_CART_LINES) {
        throw new ConflictException(`A cart holds up to ${MAX_CART_LINES} different products`);
      }
      await this.prisma.cartItem.upsert({
        where: key,
        create: { userId, productId: product.id, colorKey, quantity: input.quantity },
        update: { quantity: input.quantity },
      });
    }
    return this.get(userId);
  }

  /** After signing in, the guest cart joins the saved one: quantities add up, capped per line. */
  async merge(userId: string, lines: CartLineInput[]): Promise<Cart> {
    const incoming = await this.resolve(lines);
    await this.prisma.$transaction(async (tx) => {
      for (const line of incoming) {
        const key = {
          userId_productId_colorKey: { userId, productId: line.product.id, colorKey: line.colorKey },
        };
        const existing = await tx.cartItem.findUnique({ where: key, select: { quantity: true } });
        if (!existing && (await tx.cartItem.count({ where: { userId } })) >= MAX_CART_LINES) break;
        const quantity = Math.min(MAX_LINE_QUANTITY, (existing?.quantity ?? 0) + line.quantity);
        await tx.cartItem.upsert({
          where: key,
          create: { userId, productId: line.product.id, colorKey: line.colorKey, quantity },
          update: { quantity },
        });
      }
    });
    return this.get(userId);
  }

  private async resolve(lines: CartLineInput[]): Promise<Line[]> {
    const wanted = lines.filter((l) => l.quantity > 0);
    const products = await this.prisma.product.findMany({
      where: { slug: { in: [...new Set(wanted.map((l) => l.slug))] }, isActive: true },
      select: productSelect,
    });
    const bySlug = new Map(products.map((p) => [p.slug, p]));
    // the same product and finish twice in the input becomes one line
    const merged = new Map<string, Line>();
    for (const l of wanted) {
      const product = bySlug.get(l.slug);
      if (!product) continue;
      const colorKey = this.finish(product, l.colorKey);
      const id = `${product.id}:${colorKey}`;
      const quantity = Math.min(MAX_LINE_QUANTITY, (merged.get(id)?.quantity ?? 0) + l.quantity);
      merged.set(id, { product, colorKey, quantity });
    }
    return [...merged.values()].slice(0, MAX_CART_LINES);
  }

  /** A finish the product does not have falls back to its first finish (or none). */
  private finish(product: ProductRow, colorKey: string): string {
    if (product.colors.length === 0) return '';
    return product.colors.some((c) => c.key === colorKey) ? colorKey : product.colors[0]!.key;
  }

  private toCart(lines: Line[]): Cart {
    const items: CartLine[] = lines.map(({ product, colorKey, quantity }) => {
      const { id: _id, isActive: _active, colors, ...summary } = product;
      return {
        product: toSummary(summary),
        colorKey,
        colorLabel: colors.find((c) => c.key === colorKey)?.label ?? null,
        quantity,
        lineTotal: product.price * quantity,
        problem: product.stock === 0 ? 'OUT_OF_STOCK' : product.stock < quantity ? 'NOT_ENOUGH_STOCK' : null,
      };
    });
    return {
      items,
      subtotal: items.reduce((sum, i) => sum + i.lineTotal, 0),
      itemCount: items.reduce((sum, i) => sum + i.quantity, 0),
      canCheckout: items.length > 0 && items.every((i) => i.problem === null),
    };
  }
}
