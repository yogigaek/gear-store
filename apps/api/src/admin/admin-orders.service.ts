import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { AdminOrder, AdminOrderQuery, AdminOrderRow, ShipInput } from '@gear-store/shared';
import { OrderStatus, RefundStatus, type Prisma } from '../generated/prisma/client.js';
import { countItems, detailInclude, toDetail } from '../orders/order.mapper.js';
import { OrdersService } from '../orders/orders.service.js';
import { literal } from '../prisma/like.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** The demo administrator, whom anyone can sign in as, sees demo accounts' orders only. */
export const demoOrdersOnly = (demoOnly: boolean): Prisma.OrderWhereInput =>
  demoOnly ? { user: { isDemo: true } } : {};

@Injectable()
export class AdminOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
  ) {}

  async list(query: AdminOrderQuery, demoOnly = false) {
    await this.orders.expireOverdue();
    const filters: Prisma.OrderWhereInput = {
      ...(query.status && { status: query.status }),
      ...(query.refund === 'needed' && { refundStatus: RefundStatus.NEEDED }),
      ...(query.q && {
        OR: [
          { number: { contains: literal(query.q.toUpperCase()) } },
          { user: { email: { contains: literal(query.q.toLowerCase()) } } },
          { shipRecipient: { contains: literal(query.q), mode: 'insensitive' } },
        ],
      }),
    };
    // AND: no filter added here later can replace the demo scope
    const where: Prisma.OrderWhereInput = { AND: [demoOrdersOnly(demoOnly), filters] };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          number: true,
          status: true,
          total: true,
          createdAt: true,
          refundStatus: true,
          user: { select: { name: true, email: true } },
          items: { where: { buildId: null }, select: { quantity: true } },
          builds: { select: { quantity: true } },
        },
      }),
      this.prisma.order.count({ where }),
    ]);
    const items: AdminOrderRow[] = rows.map((o) => ({
      number: o.number,
      status: o.status,
      total: o.total,
      itemCount: countItems(o),
      customer: o.user,
      createdAt: o.createdAt.toISOString(),
      refundStatus: o.refundStatus,
    }));
    return { items, page: query.page, pageSize: query.pageSize, total };
  }

  async detail(number: string, demoOnly = false): Promise<AdminOrder> {
    await this.orders.expireOverdue();
    const order = await this.prisma.order.findFirst({
      where: { AND: [{ number }, demoOrdersOnly(demoOnly)] },
      include: { ...detailInclude, user: { select: { name: true, email: true } } },
    });
    if (!order) throw new NotFoundException('Order not found');
    return { ...toDetail(order), customer: order.user };
  }

  ship(number: string, input: ShipInput): Promise<AdminOrder> {
    return this.move(number, OrderStatus.PAID, OrderStatus.SHIPPED, 'Only a paid order can be shipped', {
      data: { courier: input.courier, trackingNumber: input.trackingNumber, shippedAt: new Date() },
      note: `Shipped with ${input.courier}. Tracking number ${input.trackingNumber}.`,
    });
  }

  deliver(number: string): Promise<AdminOrder> {
    return this.move(
      number,
      OrderStatus.SHIPPED,
      OrderStatus.DELIVERED,
      'Only a shipped order can be marked delivered',
      {
        data: { deliveredAt: new Date() },
        note: 'Delivered.',
      },
    );
  }

  /** Records that a late payment was sent back (the transfer itself happens in the Midtrans dashboard). */
  async markRefunded(number: string): Promise<AdminOrder> {
    await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { number }, select: { id: true, status: true } });
      if (!order) throw new NotFoundException('Order not found');
      const moved = await tx.order.updateMany({
        where: { id: order.id, refundStatus: RefundStatus.NEEDED },
        data: { refundStatus: RefundStatus.DONE },
      });
      if (moved.count === 0) throw new ConflictException('This order has no refund waiting');
      await tx.orderEvent.create({
        data: { orderId: order.id, status: order.status, note: 'Payment refunded.' },
      });
    });
    return this.detail(number);
  }

  /** A status change that only happens from the expected status, with its timeline entry, in one transaction. */
  private async move(
    number: string,
    from: OrderStatus,
    to: OrderStatus,
    refusal: string,
    change: { data: Prisma.OrderUpdateManyMutationInput; note: string },
  ): Promise<AdminOrder> {
    await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { number }, select: { id: true } });
      if (!order) throw new NotFoundException('Order not found');
      const moved = await tx.order.updateMany({
        where: { id: order.id, status: from },
        data: { ...change.data, status: to },
      });
      if (moved.count === 0) throw new ConflictException(refusal);
      await tx.orderEvent.create({ data: { orderId: order.id, status: to, note: change.note } });
    });
    return this.detail(number);
  }
}
