import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  PAYMENT_WINDOW_MINUTES,
  shippingFor,
  type CheckoutInput,
  type OrderDetail,
  type OrderSummary,
  type Province,
} from '@gear-store/shared';
import { OrderStatus, Prisma } from '../generated/prisma/client.js';
import { AddressesService } from '../addresses/addresses.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { newOrderNumber } from './order-number.js';

export const detailInclude = {
  items: {
    orderBy: { id: 'asc' },
    include: { product: { select: { category: { select: { slug: true } } } } },
  },
  events: { orderBy: { createdAt: 'asc' } },
  payment: true,
} satisfies Prisma.OrderInclude;

export type OrderRow = Prisma.OrderGetPayload<{ include: typeof detailInclude }>;
type Tx = Prisma.TransactionClient;

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly addresses: AddressesService,
  ) {}

  /**
   * Turns the signed-in cart into an order. Prices come from the database; stock is taken with a guarded
   * UPDATE (stock >= quantity) inside one transaction, so two buyers can never both get the last unit.
   */
  async checkout(userId: string, input: CheckoutInput): Promise<OrderDetail> {
    const existing = await this.findByKey(userId, input.idempotencyKey);
    if (existing) return this.toDetail(existing);

    await this.expireOverdue();
    const address = await this.addresses.owned(userId, input.addressId);
    const shipping = shippingFor(address.province as Province);

    try {
      const order = await this.prisma.$transaction(async (tx) => {
        const lines = await tx.cartItem.findMany({
          where: { userId },
          orderBy: { createdAt: 'asc' },
          include: { product: { include: { colors: true } } },
        });
        if (lines.length === 0) throw new BadRequestException('Your cart is empty');

        const inactive = lines.find((l) => !l.product.isActive);
        if (inactive)
          throw new ConflictException(
            `${inactive.product.name} is no longer sold. Remove it from your cart.`,
          );

        // one decrement per product (two finishes of one product share its stock), in id order to avoid deadlocks
        const perProduct = new Map<string, { name: string; quantity: number }>();
        for (const l of lines) {
          const entry = perProduct.get(l.productId) ?? { name: l.product.name, quantity: 0 };
          entry.quantity += l.quantity;
          perProduct.set(l.productId, entry);
        }
        for (const [productId, { name, quantity }] of [...perProduct].sort(([a], [b]) =>
          a.localeCompare(b),
        )) {
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
                : `Only ${left} of ${name} left. Lower the quantity in your cart.`,
            );
          }
        }

        const items = lines.map((l) => ({
          productId: l.productId,
          slug: l.product.slug,
          name: l.product.name,
          model: l.product.model,
          colorKey: l.colorKey,
          colorLabel: l.product.colors.find((c) => c.key === l.colorKey)?.label ?? null,
          unitPrice: l.product.price,
          quantity: l.quantity,
          lineTotal: l.product.price * l.quantity,
        }));
        const subtotal = items.reduce((sum, i) => sum + i.lineTotal, 0);

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
            paymentExpiresAt: new Date(Date.now() + PAYMENT_WINDOW_MINUTES * 60_000),
            items: { create: items },
            events: {
              create: {
                status: OrderStatus.PENDING_PAYMENT,
                note: `Order placed. Pay within ${PAYMENT_WINDOW_MINUTES} minutes.`,
              },
            },
          },
          include: detailInclude,
        });
        await tx.cartItem.deleteMany({ where: { userId } });
        return created;
      });
      return this.toDetail(order);
    } catch (error) {
      // the same checkout sent twice at once: the second insert loses on the unique key and returns the first
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
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
        items: { select: { quantity: true } },
      },
    });
    return rows.map((o) => ({
      number: o.number,
      status: o.status,
      total: o.total,
      itemCount: o.items.reduce((sum, i) => sum + i.quantity, 0),
      createdAt: o.createdAt.toISOString(),
    }));
  }

  async detail(userId: string, number: string): Promise<OrderDetail> {
    await this.expireOverdue();
    return this.toDetail(await this.owned(userId, number));
  }

  async cancel(userId: string, number: string): Promise<OrderDetail> {
    const order = await this.owned(userId, number);
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
    for (const item of items) {
      await tx.product.update({
        where: { id: item.productId! },
        data: { stock: { increment: item.quantity } },
      });
    }
    await tx.orderEvent.create({ data: { orderId, status: to, note } });
    return true;
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
        colorLabel: i.colorLabel,
        unitPrice: i.unitPrice,
        quantity: i.quantity,
        lineTotal: i.lineTotal,
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
