import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  MAX_CART_BUILDS,
  MAX_CART_LINES,
  MAX_LINE_QUANTITY,
  type BuildSelection,
  type Cart,
  type CartBuild,
  type CartBuildInput,
  type CartLine,
  type CartLineInput,
  type GuestCart,
} from '@gear-store/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { checkBuild, type Rulebook } from '../build/build-rules.js';
import { BuildService, toQuote } from '../build/build.service.js';
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

interface HeldBuild {
  id: string;
  selection: BuildSelection;
  quantity: number;
}

/**
 * Prices, stock and whether a build can be made always come from the database at the moment of asking. The
 * browser only ever sends which parts and how many; whatever price it might send is never read.
 */
@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly builds: BuildService,
  ) {}

  /** A cart for what a guest's browser holds. Unknown or withdrawn parts are dropped; builds keep the browser's key. */
  async quote(guest: GuestCart): Promise<Cart> {
    const book = await this.builds.bookFor(guest.builds.length);
    const held = guest.builds.map((b) => ({ id: b.key, selection: b, quantity: b.quantity }));
    return this.toCart(await this.resolve(guest.items), held, book);
  }

  async get(userId: string): Promise<Cart> {
    const [rows, held] = await Promise.all([
      this.prisma.cartItem.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        select: { colorKey: true, quantity: true, product: { select: productSelect } },
      }),
      this.heldBuilds(userId),
    ]);
    const book = await this.builds.bookFor(held.length);
    const lines = rows
      .filter((r) => r.product.isActive)
      .map((r) => ({ ...r, colorKey: this.finish(r.product, r.colorKey) }));
    return this.toCart(lines, held, book);
  }

  /** Sets one part line to an exact quantity; 0 removes it. */
  async setLine(userId: string, input: CartLineInput): Promise<Cart> {
    const product = await this.prisma.product.findFirst({
      where: { slug: input.slug, isActive: true },
      select: productSelect,
    });
    if (!product) throw new NotFoundException('Part not found');
    const colorKey = this.finish(product, input.colorKey);
    const key = { userId_productId_colorKey: { userId, productId: product.id, colorKey } };

    if (input.quantity === 0) {
      await this.prisma.cartItem.deleteMany({ where: key.userId_productId_colorKey });
    } else {
      const exists = await this.prisma.cartItem.findUnique({ where: key, select: { id: true } });
      if (!exists && (await this.prisma.cartItem.count({ where: { userId } })) >= MAX_CART_LINES) {
        throw new ConflictException(`A cart holds up to ${MAX_CART_LINES} different parts`);
      }
      await this.prisma.cartItem.upsert({
        where: key,
        create: { userId, productId: product.id, colorKey, quantity: input.quantity },
        update: { quantity: input.quantity },
      });
    }
    return this.get(userId);
  }

  /**
   * Adds a bike. It must be buildable as it stands (every slot, no conflicts, a real colour, enough stock); the
   * same build already in the cart gets the quantity added instead of a second entry.
   */
  async addBuild(userId: string, input: CartBuildInput): Promise<Cart> {
    const book = await this.builds.book();
    await this.prisma.$transaction((tx) => this.putBuild(tx, userId, input, book, 'refuse'));
    return this.get(userId);
  }

  /** Sets a bike in the cart to an exact quantity; 0 removes it. */
  async setBuildQuantity(userId: string, id: string, quantity: number): Promise<Cart> {
    const where = { id, userId };
    const { count } =
      quantity === 0
        ? await this.prisma.cartBuild.deleteMany({ where })
        : await this.prisma.cartBuild.updateMany({ where, data: { quantity } });
    if (!count) throw new NotFoundException('That bike is not in your cart');
    return this.get(userId);
  }

  /** After signing in, the guest cart joins the saved one: quantities add up, capped per line and per build. */
  async merge(userId: string, guest: GuestCart): Promise<Cart> {
    const [incoming, book] = await Promise.all([
      this.resolve(guest.items),
      this.builds.bookFor(guest.builds.length),
    ]);
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
      // a guest's build that can no longer be made is left behind rather than failing the sign-in; one that is
      // only short of stock is kept, and the cart says so, as it does for a single part
      for (const build of guest.builds) await this.putBuild(tx, userId, build, book, 'skip');
    });
    return this.get(userId);
  }

  /** the account's saved builds, as selections to be checked against today's catalogue */
  async heldBuilds(userId: string, db: Pick<PrismaService, 'cartBuild'> = this.prisma): Promise<HeldBuild[]> {
    const rows = await db.cartBuild.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        colorKey: true,
        quantity: true,
        parts: { select: { product: { select: { slug: true, category: { select: { slug: true } } } } } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      quantity: r.quantity,
      selection: {
        colorKey: r.colorKey,
        parts: Object.fromEntries(r.parts.map((p) => [p.product.category.slug, p.product.slug])),
      },
    }));
  }

  private async putBuild(
    tx: Prisma.TransactionClient,
    userId: string,
    input: CartBuildInput,
    book: Rulebook,
    onProblem: 'refuse' | 'skip',
  ): Promise<void> {
    // the same bike already in the cart takes the added quantity, and the check is for the total
    const identity = checkBuild(book, input);
    const slugs = identity.parts
      .map((p) => p.part.summary.slug)
      .sort()
      .join();
    const same = (await this.heldBuilds(userId, tx)).find(
      (b) =>
        b.selection.colorKey === identity.colorKey &&
        Object.values(b.selection.parts).sort().join() === slugs,
    );
    const quantity = Math.min(MAX_LINE_QUANTITY, (same?.quantity ?? 0) + input.quantity);
    const checked = checkBuild(book, input, quantity);
    // signing in keeps a guest's bike that is only short of stock, as it keeps a single part; adding refuses it
    const blocker =
      onProblem === 'skip' ? checked.problems.find((p) => p.kind !== 'OUT_OF_STOCK') : checked.problems[0];
    if (blocker) {
      if (onProblem === 'skip') return;
      throw new ConflictException(blocker.message);
    }
    if (same) {
      await tx.cartBuild.update({ where: { id: same.id }, data: { quantity } });
      return;
    }
    if ((await tx.cartBuild.count({ where: { userId } })) >= MAX_CART_BUILDS) {
      if (onProblem === 'skip') return;
      throw new ConflictException(`A cart holds up to ${MAX_CART_BUILDS} different bikes`);
    }
    await tx.cartBuild.create({
      data: {
        userId,
        colorKey: checked.colorKey,
        quantity: input.quantity,
        parts: { create: checked.parts.map(({ part }) => ({ productId: part.id })) },
      },
    });
  }

  private async resolve(lines: CartLineInput[]): Promise<Line[]> {
    const wanted = lines.filter((l) => l.quantity > 0);
    const products = await this.prisma.product.findMany({
      where: { slug: { in: [...new Set(wanted.map((l) => l.slug))] }, isActive: true },
      select: productSelect,
    });
    const bySlug = new Map(products.map((p) => [p.slug, p]));
    // the same part and finish twice in the input becomes one line
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

  /** A finish the part does not have falls back to its first finish (or none). */
  private finish(product: ProductRow, colorKey: string): string {
    if (product.colors.length === 0) return '';
    return product.colors.some((c) => c.key === colorKey) ? colorKey : product.colors[0]!.key;
  }

  private toCart(lines: Line[], held: HeldBuild[], book: Rulebook): Cart {
    const checked = held.map((b) => ({ ...b, checked: checkBuild(book, b.selection, b.quantity) }));

    // what checking out would take from each part's stock, single parts and bike parts together, as checkout does
    const demand = new Map<string, number>();
    const take = (id: string, quantity: number) => demand.set(id, (demand.get(id) ?? 0) + quantity);
    for (const l of lines) take(l.product.id, l.quantity);
    for (const b of checked) for (const { part } of b.checked.parts) take(part.id, b.quantity);
    const short = (id: string, stock: number) => stock < (demand.get(id) ?? 0);

    const items: CartLine[] = lines.map(({ product, colorKey, quantity }) => {
      const { id, isActive: _active, colors, ...summary } = product;
      return {
        product: toSummary(summary),
        colorKey,
        colorLabel: colors.find((c) => c.key === colorKey)?.label ?? null,
        quantity,
        lineTotal: product.price * quantity,
        problem: product.stock === 0 ? 'OUT_OF_STOCK' : short(id, product.stock) ? 'NOT_ENOUGH_STOCK' : null,
      };
    });
    const builds: CartBuild[] = checked.map(({ id, quantity, checked: build }) => {
      const problems = [...build.problems];
      // enough for this bike alone, but not with the rest of the cart
      for (const { slot, part } of build.parts) {
        const { stock, name } = part.summary;
        if (stock > 0 && short(part.id, stock) && !problems.some((p) => p.slots.includes(slot.category))) {
          problems.push({
            kind: 'OUT_OF_STOCK',
            message: `Only ${stock} of ${name} left for everything in your cart.`,
            slots: [slot.category],
          });
        }
      }
      const other = problems.some((p) => p.kind !== 'OUT_OF_STOCK');
      const soldOut = build.parts.some((p) => p.part.summary.stock === 0);
      return {
        id,
        quote: toQuote({ ...build, problems }),
        quantity,
        // a bike that cannot be built has no price: its parts' sum would leave out the missing ones
        lineTotal: other ? 0 : build.unitPrice * quantity,
        problem: other
          ? 'CANNOT_BUILD'
          : problems.length === 0
            ? null
            : soldOut
              ? 'OUT_OF_STOCK'
              : 'NOT_ENOUGH_STOCK',
      };
    });
    return {
      items,
      builds,
      subtotal: [...items, ...builds].reduce((sum, l) => sum + l.lineTotal, 0),
      itemCount: [...items, ...builds].reduce((sum, l) => sum + l.quantity, 0),
      canCheckout: items.length + builds.length > 0 && [...items, ...builds].every((l) => l.problem === null),
    };
  }
}
