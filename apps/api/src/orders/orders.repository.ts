import { Injectable } from '@nestjs/common';
import type { ShippingAddress } from '../addresses/addresses.service.js';
import { carriesColour, type CheckedBuild } from '../build/build-rules.js';
import { BUILD_NAME } from '../build/build.service.js';
import { OrderStatus, type Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { detailInclude, type OrderRow } from './order.mapper.js';
import { newOrderNumber } from './order-number.js';

type Tx = Prisma.TransactionClient;
export type PartLine = {
  product: Prisma.ProductGetPayload<{ include: { colors: true } }>;
  colorKey: string;
  quantity: number;
};
export type Bike = CheckedBuild & { quantity: number };
/** what an order takes from each part's stock, by product id */
export type Demand = Map<string, { name: string; quantity: number }>;

export interface NewOrder {
  userId: string;
  idempotencyKey: string;
  address: ShippingAddress;
  shipping: { zone: string; fee: number };
  holdMinutes: number;
  lines: PartLine[];
  bikes: Bike[];
}

/** Locks go orders first, then products, each in id order, so no two transactions wait in a circle. */
@Injectable()
export class OrdersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findDetail(where: Prisma.OrderWhereUniqueInput): Promise<OrderRow | null> {
    return this.prisma.order.findUnique({ where, include: detailInclude });
  }

  /** Guarded decrements (stock >= quantity) in id order; returns the first part short of stock, or null. */
  async reserveStock(tx: Tx, demand: Demand): Promise<{ name: string; left: number } | null> {
    for (const [productId, { name, quantity }] of [...demand].sort(([a], [b]) => a.localeCompare(b))) {
      const taken = await tx.product.updateMany({
        where: { id: productId, isActive: true, stock: { gte: quantity } },
        data: { stock: { decrement: quantity } },
      });
      if (taken.count === 0) {
        const left = await tx.product.findUnique({ where: { id: productId }, select: { stock: true } });
        return { name, left: left?.stock ?? 0 };
      }
    }
    return null;
  }

  /** Writes the order with its parts and bikes, prices and address copied in; returns its id. */
  async createOrder(tx: Tx, o: NewOrder): Promise<string> {
    const items = o.lines.map((l) => ({
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
      o.bikes.reduce((sum, b) => sum + b.unitPrice * b.quantity, 0);

    const { id } = await tx.order.create({
      data: {
        number: newOrderNumber(),
        userId: o.userId,
        subtotal,
        shippingFee: o.shipping.fee,
        total: subtotal + o.shipping.fee,
        shippingZone: o.shipping.zone,
        shipRecipient: o.address.recipient,
        shipPhone: o.address.phone,
        shipLine1: o.address.line1,
        shipLine2: o.address.line2,
        shipCity: o.address.city,
        shipProvince: o.address.province,
        shipPostalCode: o.address.postalCode,
        idempotencyKey: o.idempotencyKey,
        paymentExpiresAt: new Date(Date.now() + o.holdMinutes * 60_000),
        items: { create: items },
        events: {
          create: {
            status: OrderStatus.PENDING_PAYMENT,
            note: `Order placed. Pay within ${o.holdMinutes} minutes.`,
          },
        },
      },
      select: { id: true },
    });
    for (const bike of o.bikes) {
      await tx.orderBuild.create({
        data: {
          orderId: id,
          label: BUILD_NAME,
          colorKey: bike.colorKey,
          colorLabel: bike.colorLabel,
          quantity: bike.quantity,
          unitPrice: bike.unitPrice,
          lineTotal: bike.unitPrice * bike.quantity,
          items: {
            create: bike.parts.map(({ part }) => ({
              orderId: id,
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
    return id;
  }

  /** Locks the orders, then (if `alsoProducts`) those and the orders' products, each set in id order. */
  async lockOrders(tx: Tx, orderIds: string[], alsoProducts: Iterable<string> = []): Promise<void> {
    await tx.$queryRaw`SELECT 1 FROM "Order" WHERE "id" = ANY(${orderIds}::uuid[]) ORDER BY "id" FOR NO KEY UPDATE`;
    const more = [...alsoProducts];
    if (more.length === 0) return;
    const held = await tx.orderItem.findMany({
      where: { orderId: { in: orderIds }, productId: { not: null } },
      select: { productId: true },
    });
    const products = [...new Set([...held.flatMap((i) => i.productId ?? []), ...more])];
    await tx.$queryRaw`SELECT 1 FROM "Product" WHERE "id" = ANY(${products}::uuid[]) ORDER BY "id" FOR NO KEY UPDATE`;
  }

  /** Status-guarded: a concurrent payment and this close never both win. Lock several with lockOrders. */
  async closeOrders(
    tx: Tx,
    orderIds: string[],
    to: 'CANCELLED' | 'EXPIRED',
    note: string,
  ): Promise<string[]> {
    const moved = await tx.order.updateManyAndReturn({
      where: { id: { in: orderIds }, status: OrderStatus.PENDING_PAYMENT },
      data: { status: to, closedAt: new Date() },
      select: { id: true },
    });
    const ids = moved.map((o) => o.id);
    if (ids.length === 0) return ids;
    // one increment per part however many lines hold it, in id order as checkout takes them
    const held = await tx.orderItem.groupBy({
      by: ['productId'],
      where: { orderId: { in: ids }, productId: { not: null } },
      _sum: { quantity: true },
      orderBy: { productId: 'asc' },
    });
    for (const { productId, _sum } of held) {
      // type only: groupBy keeps the column nullable though the where above leaves null out
      if (productId === null) continue;
      await tx.product.update({
        where: { id: productId },
        data: { stock: { increment: _sum.quantity ?? 0 } },
      });
    }
    await tx.orderEvent.createMany({ data: ids.map((orderId) => ({ orderId, status: to, note })) });
    return ids;
  }

  /** Expires up to 100 orders past their payment window in one transaction; returns how many. */
  async closeOverdue(note: string): Promise<number> {
    const overdue = await this.prisma.order.findMany({
      where: { status: OrderStatus.PENDING_PAYMENT, paymentExpiresAt: { lt: new Date() } },
      select: { id: true },
      take: 100,
    });
    if (overdue.length === 0) return 0;
    const ids = overdue.map((o) => o.id);
    return this.prisma.$transaction(async (tx) => {
      await this.lockOrders(tx, ids);
      return (await this.closeOrders(tx, ids, OrderStatus.EXPIRED, note)).length;
    });
  }
}
