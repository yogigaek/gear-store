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
  type Province,
} from '@gear-store/shared';
import { OrderStatus, type Prisma } from '../generated/prisma/client.js';
import { AddressesService } from '../addresses/addresses.service.js';
import { carriesColour, checkBuild, type CheckedBuild } from '../build/build-rules.js';
import { BUILD_NAME, BuildService } from '../build/build.service.js';
import { CartService, lockCart } from '../cart/cart.service.js';
import { isUniqueViolation } from '../prisma/errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { newOrderNumber } from './order-number.js';

export const detailInclude = {
  items: {
    orderBy: { id: 'asc' },
    include: { product: { select: { module: true, category: { select: { slug: true } } } } },
  },
  builds: { orderBy: { id: 'asc' } },
  events: { orderBy: { createdAt: 'asc' } },
  payment: true,
} satisfies Prisma.OrderInclude;

/** what an order list counts: each single part, and each bike as one, not its parts */
export const countItems = (o: { items: { quantity: number }[]; builds: { quantity: number }[] }) =>
  [...o.items, ...o.builds].reduce((sum, i) => sum + i.quantity, 0);

/** each waiting order holds stock: without a cap, one account could hold the catalogue by never paying */
const MAX_UNPAID_ORDERS = 3;
/** demo accounts are shared: a demo order stays small, and replaces the account's waiting one (see checkout) */
const DEMO_ORDER_MAX_ITEMS = 5;

export type OrderRow = Prisma.OrderGetPayload<{ include: typeof detailInclude }>;
type Tx = Prisma.TransactionClient;
type PartLine = {
  product: Prisma.ProductGetPayload<{ include: { colors: true } }>;
  colorKey: string;
  quantity: number;
};
type Bike = CheckedBuild & { quantity: number };

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
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
    if (existing) return this.toDetail(existing);

    await this.expireOverdue();
    const address = await this.addresses.owned(userId, input.addressId);
    const shipping = shippingFor(address.province as Province);
    const { isDemo } = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { isDemo: true },
    });
    const holdMinutes = paymentWindowMinutes(isDemo);

    try {
      const placed = await this.prisma.$transaction(
        async (tx) => {
          // one checkout per account at a time, and no cart change between reading the cart and emptying it
          await lockCart(tx, userId);
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

          // what the order takes from each part's stock: single parts and bike parts together
          const demand = new Map<string, { name: string; quantity: number }>();
          const take = (id: string, name: string, quantity: number) => {
            const entry = demand.get(id) ?? { name, quantity: 0 };
            entry.quantity += quantity;
            demand.set(id, entry);
          };
          for (const l of lines) take(l.product.id, l.product.name, l.quantity);
          for (const bike of bikes) {
            for (const { part } of bike.parts) take(part.id, part.summary.name, bike.quantity);
          }

          // a demo account's waiting order makes way, its stock released first; a refusal below undoes this too
          if (isDemo && unpaid.length > 0) {
            const replaced = unpaid.map((o) => o.id);
            const released = await tx.orderItem.findMany({
              where: { orderId: { in: replaced }, productId: { not: null } },
              select: { productId: true },
            });
            // close()'s lock order: the orders, then every product either step touches, each in id order
            await tx.$queryRaw`SELECT 1 FROM "Order" WHERE "id" = ANY(${replaced}::uuid[]) ORDER BY "id" FOR NO KEY UPDATE`;
            const products = [...new Set([...released.map((i) => i.productId!), ...demand.keys()])];
            await tx.$queryRaw`SELECT 1 FROM "Product" WHERE "id" = ANY(${products}::uuid[]) ORDER BY "id" FOR NO KEY UPDATE`;
            for (const id of replaced)
              await this.close(
                tx,
                id,
                OrderStatus.CANCELLED,
                'Replaced by a newer demo order. The items went back on sale.',
              );
          }

          // one guarded decrement per part, in id order so two checkouts never lock rows in opposite orders
          for (const [productId, { name, quantity }] of [...demand].sort(([a], [b]) => a.localeCompare(b))) {
            const taken = await tx.product.updateMany({
              where: { id: productId, isActive: true, stock: { gte: quantity } },
              data: { stock: { decrement: quantity } },
            });
            if (taken.count === 0) {
              const left =
                (await tx.product.findUnique({ where: { id: productId }, select: { stock: true } }))?.stock ??
                0;
              throw new ConflictException(
                left === 0
                  ? `${name} just sold out.`
                  : input.items
                    ? `Only ${left} of ${name} left.`
                    : `Only ${left} of ${name} left. Lower the quantity in your cart.`,
              );
            }
          }

          const items = lines.map((l) => ({
            productId: l.product.id,
            slug: l.product.slug,
            name: l.product.name,
            model: l.product.model,
            colorKey: l.colorKey,
            colorLabel: l.product.colors.find((c) => c.key === l.colorKey)?.label ?? null,
            unitPrice: l.product.price,
            quantity: l.quantity,
            lineTotal: l.product.price * l.quantity,
          }));
          const subtotal =
            items.reduce((sum, i) => sum + i.lineTotal, 0) +
            bikes.reduce((sum, b) => sum + b.unitPrice * b.quantity, 0);

          const created = await tx.order.create({
            data: {
              number: newOrderNumber(),
              userId,
              subtotal,
              shippingFee: shipping.fee,
              total: subtotal + shipping.fee,
              shippingZone: shipping.zone,
              shipRecipient: address.recipient,
              shipPhone: address.phone,
              shipLine1: address.line1,
              shipLine2: address.line2,
              shipCity: address.city,
              shipProvince: address.province,
              shipPostalCode: address.postalCode,
              idempotencyKey: input.idempotencyKey,
              paymentExpiresAt: new Date(Date.now() + holdMinutes * 60_000),
              items: { create: items },
              events: {
                create: {
                  status: OrderStatus.PENDING_PAYMENT,
                  note: `Order placed. Pay within ${holdMinutes} minutes.`,
                },
              },
            },
            select: { id: true },
          });
          for (const bike of bikes) {
            await tx.orderBuild.create({
              data: {
                orderId: created.id,
                label: BUILD_NAME,
                colorKey: bike.colorKey,
                colorLabel: bike.colorLabel,
                quantity: bike.quantity,
                unitPrice: bike.unitPrice,
                lineTotal: bike.unitPrice * bike.quantity,
                items: {
                  create: bike.parts.map(({ part }) => ({
                    orderId: created.id,
                    productId: part.id,
                    slug: part.summary.slug,
                    name: part.summary.name,
                    model: part.summary.model,
                    colorKey: carriesColour(part) ? bike.colorKey : '',
                    colorLabel: carriesColour(part) ? bike.colorLabel : null,
                    unitPrice: part.summary.price,
                    quantity: bike.quantity,
                    lineTotal: part.summary.price * bike.quantity,
                  })),
                },
              },
            });
          }
          if (!input.items) {
            await tx.cartItem.deleteMany({ where: { userId } });
            await tx.cartBuild.deleteMany({ where: { userId } });
          }
          return { orderId: created.id };
        },
        // checkouts of one account queue on its lock (the shared demo shopper most of all): room to wait their turn
        { maxWait: 10_000, timeout: 20_000 },
      );
      if (placed.withdrawn) {
        throw new ConflictException(
          `No longer sold, so taken out of your cart: ${placed.withdrawn.join(', ')}. Check your cart and place the order again.`,
        );
      }
      return this.toDetail(
        await this.prisma.order.findUniqueOrThrow({ where: { id: placed.orderId }, include: detailInclude }),
      );
    } catch (error) {
      // the same checkout sent twice at once: the second insert loses on the unique key and returns the first
      if (isUniqueViolation(error)) {
        const winner = await this.findByKey(userId, input.idempotencyKey);
        if (winner) return this.toDetail(winner);
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
    return this.toDetail(await this.owned(userId, number));
  }

  async cancel(userId: string, number: string): Promise<OrderDetail> {
    const order = await this.prisma.order.findFirst({ where: { number, userId }, select: { id: true } });
    if (!order) throw new NotFoundException('Order not found');
    const closed = await this.prisma.$transaction((tx) =>
      this.close(tx, order.id, OrderStatus.CANCELLED, 'Cancelled by you. The items went back on sale.'),
    );
    if (!closed) throw new ConflictException('Only an order that is waiting for payment can be cancelled');
    return this.toDetail(await this.owned(userId, number));
  }

  /**
   * Orders past their payment window give their stock back. Called before reads and checkouts rather than
   * from a timer, because the free host sleeps when idle and a timer would not fire.
   */
  async expireOverdue(): Promise<number> {
    const overdue = await this.prisma.order.findMany({
      where: { status: OrderStatus.PENDING_PAYMENT, paymentExpiresAt: { lt: new Date() } },
      select: { id: true },
      take: 100,
    });
    let expired = 0;
    for (const { id } of overdue) {
      const done = await this.prisma.$transaction((tx) =>
        this.close(tx, id, OrderStatus.EXPIRED, 'Payment time ran out. The items went back on sale.'),
      );
      if (done) expired += 1;
    }
    if (expired) this.logger.log(`Expired ${expired} unpaid order(s)`);
    return expired;
  }

  /**
   * Moves a waiting order to CANCELLED or EXPIRED and puts its stock back. The status check is part of the
   * UPDATE, so a payment arriving at the same moment and this close can never both win.
   */
  async close(tx: Tx, orderId: string, to: 'CANCELLED' | 'EXPIRED', note: string): Promise<boolean> {
    const moved = await tx.order.updateMany({
      where: { id: orderId, status: OrderStatus.PENDING_PAYMENT },
      data: { status: to, closedAt: new Date() },
    });
    if (moved.count === 0) return false;
    const items = await tx.orderItem.findMany({ where: { orderId, productId: { not: null } } });
    // stock goes back in the order checkout takes it, so the two never lock product rows in opposite orders
    items.sort((a, b) => a.productId!.localeCompare(b.productId!));
    for (const item of items) {
      await tx.product.update({
        where: { id: item.productId! },
        data: { stock: { increment: item.quantity } },
      });
    }
    await tx.orderEvent.create({ data: { orderId, status: to, note } });
    return true;
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
      orderBy: { createdAt: 'asc' },
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
    return this.prisma.order.findUnique({
      where: { userId_idempotencyKey: { userId, idempotencyKey } },
      include: detailInclude,
    });
  }

  private async owned(userId: string, number: string): Promise<OrderRow> {
    const order = await this.prisma.order.findFirst({ where: { number, userId }, include: detailInclude });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  toDetail(o: OrderRow): OrderDetail {
    const waiting = o.status === OrderStatus.PENDING_PAYMENT && o.paymentExpiresAt > new Date();
    return {
      number: o.number,
      status: o.status,
      subtotal: o.subtotal,
      shippingFee: o.shippingFee,
      total: o.total,
      shipping: {
        recipient: o.shipRecipient,
        phone: o.shipPhone,
        line1: o.shipLine1,
        line2: o.shipLine2,
        city: o.shipCity,
        province: o.shipProvince,
        postalCode: o.shipPostalCode,
        zone: o.shippingZone,
      },
      items: o.items.map((i) => ({
        slug: i.slug,
        name: i.name,
        model: i.model,
        category: i.product?.category.slug ?? null,
        module: i.product?.module ?? null,
        colorKey: i.colorKey,
        colorLabel: i.colorLabel,
        unitPrice: i.unitPrice,
        quantity: i.quantity,
        lineTotal: i.lineTotal,
        buildId: i.buildId,
      })),
      builds: o.builds.map((b) => ({
        id: b.id,
        label: b.label,
        colorKey: b.colorKey,
        colorLabel: b.colorLabel,
        quantity: b.quantity,
        unitPrice: b.unitPrice,
        lineTotal: b.lineTotal,
      })),
      events: o.events.map((e) => ({ status: e.status, note: e.note, at: e.createdAt.toISOString() })),
      createdAt: o.createdAt.toISOString(),
      paymentExpiresAt: o.paymentExpiresAt.toISOString(),
      paidAt: o.paidAt?.toISOString() ?? null,
      payment: o.payment
        ? {
            redirectUrl: o.payment.redirectUrl,
            status: o.payment.transactionStatus,
            method: o.payment.paymentType,
          }
        : null,
      canPay: waiting,
      canCancel: waiting,
      fulfilment: {
        courier: o.courier,
        trackingNumber: o.trackingNumber,
        shippedAt: o.shippedAt?.toISOString() ?? null,
        deliveredAt: o.deliveredAt?.toISOString() ?? null,
      },
      refundStatus: o.refundStatus,
    };
  }
}
