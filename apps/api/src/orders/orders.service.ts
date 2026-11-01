import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  MAX_LINE_QUANTITY,
  paymentWindowMinutes,
  shippingFor,
  type CartLineInput,
  type CheckoutInput,
  type OrderDetail,
  type OrderSummary,
} from '@gear-store/shared';
import { OrderStatus, type Prisma } from '../generated/prisma/client.js';
import { AddressesService } from '../addresses/addresses.service.js';
import { checkBuild } from '../build/build-rules.js';
import { BuildService } from '../build/build.service.js';
import { CartService } from '../cart/cart.service.js';
import { isUniqueViolation } from '../prisma/errors.js';
import { lockAccount } from '../prisma/locks.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { countItems, toDetail, type OrderRow } from './order.mapper.js';
import { OrdersRepository, type Bike, type Demand, type PartLine } from './orders.repository.js';

/** each waiting order holds stock: without a cap, one account could hold the catalogue by never paying */
const MAX_UNPAID_ORDERS = 3;
/** demo accounts are shared: a demo order stays small, and replaces the account's waiting one (see checkout) */
const DEMO_ORDER_MAX_ITEMS = 5;
const EXPIRED_NOTE = 'Payment time ran out. The items went back on sale.';

type Tx = Prisma.TransactionClient;

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: OrdersRepository,
    private readonly addresses: AddressesService,
    private readonly cart: CartService,
    private readonly builds: BuildService,
  ) {}

  /**
   * Turns the signed-in cart into an order: single parts and bikes alike. Each bike is checked again against
   * today's catalogue and broken down into its parts; prices come from the database; every part's stock is
   * taken with a guarded UPDATE (stock >= quantity) inside one transaction, so two buyers can never both get the
   * last unit, and a bike is never sold with one of its parts missing. With `items` ("Buy now") only those parts
   * are ordered, the same way, and the cart is left as it is.
   */
  async checkout(userId: string, input: CheckoutInput): Promise<OrderDetail> {
    const existing = await this.findByKey(userId, input.idempotencyKey);
    if (existing) return toDetail(existing);

    await this.expireOverdue();
    const address = await this.addresses.owned(userId, input.addressId);
    const shipping = shippingFor(address.province);
    const { isDemo } = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { isDemo: true },
    });
    const holdMinutes = paymentWindowMinutes(isDemo);

    try {
      const placed = await this.prisma.$transaction(
        async (tx) => {
          // one checkout per account at a time, and no cart change between reading the cart and emptying it
          await lockAccount(tx, userId);
          const placedMeanwhile = await tx.order.findUnique({
            where: { userId_idempotencyKey: { userId, idempotencyKey: input.idempotencyKey } },
            select: { id: true },
          });
          if (placedMeanwhile) return { orderId: placedMeanwhile.id };

          // read under the account's lock above, so two checkouts at once cannot both slip under the cap
          const unpaid = await tx.order.findMany({
            where: { userId, status: OrderStatus.PENDING_PAYMENT, paymentExpiresAt: { gt: new Date() } },
            select: { id: true },
          });
          if (!isDemo && unpaid.length >= MAX_UNPAID_ORDERS) {
            throw new ConflictException({
              statusCode: 409,
              message: `You have ${MAX_UNPAID_ORDERS} orders waiting for payment. Pay or cancel one of them before placing another.`,
              code: 'TOO_MANY_UNPAID_ORDERS',
            });
          }

          const picked = input.items
            ? { lines: await this.pickedLines(tx, input.items), bikes: [] }
            : await this.cartContents(tx, userId);
          if ('withdrawn' in picked) return { withdrawn: picked.withdrawn };
          const { lines, bikes } = picked;
          // items as the order lists count them: a bike is one
          if (isDemo && countItems({ items: lines, builds: bikes }) > DEMO_ORDER_MAX_ITEMS) {
            throw new ConflictException({
              statusCode: 409,
              message: `A demo order holds at most ${DEMO_ORDER_MAX_ITEMS} items. Remove some and try again.`,
              code: 'DEMO_ORDER_TOO_LARGE',
            });
          }
          const demand = demandOf(lines, bikes);

          // a demo account's waiting order makes way, its stock released first; a refusal below undoes this too
          if (isDemo && unpaid.length > 0) {
            const replaced = unpaid.map((o) => o.id);
            await this.repo.lockOrders(tx, replaced, demand.keys());
            await this.repo.closeOrders(
              tx,
              replaced,
              OrderStatus.CANCELLED,
              'Replaced by a newer demo order. The items went back on sale.',
            );
          }

          const short = await this.repo.reserveStock(tx, demand);
          if (short) {
            throw new ConflictException(
              short.left === 0
                ? `${short.name} just sold out.`
                : input.items
                  ? `Only ${short.left} of ${short.name} left.`
                  : `Only ${short.left} of ${short.name} left. Lower the quantity in your cart.`,
            );
          }
          const orderId = await this.repo.createOrder(tx, {
            userId,
            idempotencyKey: input.idempotencyKey,
            address,
            shipping,
            holdMinutes,
            lines,
            bikes,
          });
          if (!input.items) {
            await tx.cartItem.deleteMany({ where: { userId } });
            await tx.cartBuild.deleteMany({ where: { userId } });
          }
          return { orderId };
        },
        // checkouts of one account queue on its lock (the shared demo shopper most of all): room to wait their turn
        { maxWait: 10_000, timeout: 20_000 },
      );
      if (placed.withdrawn) {
        throw new ConflictException(
          `No longer sold, so taken out of your cart: ${placed.withdrawn.join(', ')}. Check your cart and place the order again.`,
        );
      }
      const order = await this.repo.findDetail({ id: placed.orderId });
      if (!order) throw new NotFoundException('Order not found');
      return toDetail(order);
    } catch (error) {
      // the same checkout sent twice at once: the second insert loses on the unique key and returns the first
      if (isUniqueViolation(error)) {
        const winner = await this.findByKey(userId, input.idempotencyKey);
        if (winner) return toDetail(winner);
      }
      throw error;
    }
  }

  async list(userId: string): Promise<OrderSummary[]> {
    await this.expireOverdue();
    const rows = await this.prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        number: true,
        status: true,
        total: true,
        createdAt: true,
        items: { where: { buildId: null }, select: { quantity: true } },
        builds: { select: { quantity: true } },
      },
    });
    return rows.map((o) => ({
      number: o.number,
      status: o.status,
      total: o.total,
      itemCount: countItems(o),
      createdAt: o.createdAt.toISOString(),
    }));
  }

  async detail(userId: string, number: string): Promise<OrderDetail> {
    await this.expireOverdue();
    return toDetail(await this.owned(userId, number));
  }

  async cancel(userId: string, number: string): Promise<OrderDetail> {
    const order = await this.prisma.order.findFirst({ where: { number, userId }, select: { id: true } });
    if (!order) throw new NotFoundException('Order not found');
    const closed = await this.prisma.$transaction((tx) =>
      this.close(tx, order.id, OrderStatus.CANCELLED, 'Cancelled by you. The items went back on sale.'),
    );
    if (!closed) throw new ConflictException('Only an order that is waiting for payment can be cancelled');
    return toDetail(await this.owned(userId, number));
  }

  /**
   * Orders past their payment window give their stock back. Called before reads and checkouts rather than
   * from a timer, because the free host sleeps when idle and a timer would not fire.
   */
  async expireOverdue(): Promise<number> {
    try {
      const expired = await this.repo.closeOverdue(EXPIRED_NOTE);
      if (expired) this.logger.log(`Expired ${expired} unpaid order(s)`);
      return expired;
    } catch (error) {
      // housekeeping for whoever reads next: its failure must not fail this request, the next read retries
      this.logger.warn(`Closing overdue orders failed: ${String(error)}`);
      return 0;
    }
  }

  /** Closes a waiting order as CANCELLED or EXPIRED, its stock given back; false if it no longer waited. */
  async close(tx: Tx, orderId: string, to: 'CANCELLED' | 'EXPIRED', note: string): Promise<boolean> {
    return (await this.repo.closeOrders(tx, [orderId], to, note)).length > 0;
  }

  /** The signed-in cart, its bikes checked against today's catalogue; or the withdrawn parts it held, now removed. */
  private async cartContents(
    tx: Tx,
    userId: string,
  ): Promise<{ lines: PartLine[]; bikes: Bike[] } | { withdrawn: string[] }> {
    // one after the other: a transaction is one connection, and pg is dropping queries sent over one at once
    await this.cart.settleFinishes(tx, userId);
    const lines = await tx.cartItem.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: { product: { include: { colors: true } } },
    });
    const held = await this.cart.heldBuilds(userId, tx);
    // the cart hides withdrawn parts and cannot remove them: they go here, and the shopper looks again
    const withdrawn = lines.filter((l) => !l.product.isActive);
    if (withdrawn.length > 0) {
      await tx.cartItem.deleteMany({ where: { id: { in: withdrawn.map((l) => l.id) } } });
      return { withdrawn: withdrawn.map((l) => l.product.name) };
    }
    const book = await this.builds.bookFor(held.length, tx);
    if (lines.length === 0 && held.length === 0) throw new BadRequestException('Your cart is empty');

    const bikes = held.map((b) => {
      const checked = checkBuild(book, b.selection, b.quantity);
      const blocker = checked.problems.find((p) => p.kind !== 'OUT_OF_STOCK');
      if (blocker)
        throw new ConflictException(`A bike in your cart can no longer be built: ${blocker.message}`);
      return { ...checked, quantity: b.quantity };
    });
    return { lines, bikes };
  }

  /** "Buy now": the parts asked for, one line per part and finish, finishes chosen as the cart chooses them. */
  private async pickedLines(tx: Tx, wanted: CartLineInput[]): Promise<PartLine[]> {
    const products = await tx.product.findMany({
      where: { slug: { in: [...new Set(wanted.map((l) => l.slug))] } },
      include: { colors: { orderBy: { position: 'asc' } } },
    });
    const bySlug = new Map(products.map((p) => [p.slug, p]));
    const lines = new Map<string, PartLine>();
    for (const l of wanted) {
      const product = bySlug.get(l.slug);
      if (!product) throw new NotFoundException('Part not found');
      if (!product.isActive) throw new ConflictException(`${product.name} is no longer sold.`);
      const colorKey = this.cart.finish(product, l.colorKey);
      const id = `${product.id}:${colorKey}`;
      const quantity = (lines.get(id)?.quantity ?? 0) + l.quantity;
      if (quantity > MAX_LINE_QUANTITY) {
        throw new BadRequestException(`At most ${MAX_LINE_QUANTITY} of ${product.name} in one order.`);
      }
      lines.set(id, { product, colorKey, quantity });
    }
    return [...lines.values()];
  }

  private findByKey(userId: string, idempotencyKey: string) {
    return this.repo.findDetail({ userId_idempotencyKey: { userId, idempotencyKey } });
  }

  private async owned(userId: string, number: string): Promise<OrderRow> {
    const order = await this.repo.findDetail({ number, userId });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }
}

/** what the order takes from each part's stock: single parts and bike parts together */
function demandOf(lines: PartLine[], bikes: Bike[]): Demand {
  const demand: Demand = new Map();
  const take = (id: string, name: string, quantity: number) => {
    const entry = demand.get(id) ?? { name, quantity: 0 };
    entry.quantity += quantity;
    demand.set(id, entry);
  };
  for (const l of lines) take(l.product.id, l.product.name, l.quantity);
  for (const bike of bikes) {
    for (const { part } of bike.parts) take(part.id, part.summary.name, bike.quantity);
  }
  return demand;
}
