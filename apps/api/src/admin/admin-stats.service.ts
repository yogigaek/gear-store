import { Injectable } from '@nestjs/common';
import { LOW_STOCK_THRESHOLD, type AdminStats } from '@gear-store/shared';
import { jakartaIso } from '../common/time.js';
import { OrderStatus, RefundStatus } from '../generated/prisma/client.js';
import { PAID_STATUSES } from '../orders/order-status.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** "2026-10-09" for the Jakarta calendar day of an instant */
function jakartaDay(date: Date): string {
  return jakartaIso(date).slice(0, 10);
}

@Injectable()
export class AdminStatsService {
  constructor(private readonly prisma: PrismaService) {}

  async stats(days: number): Promise<AdminStats> {
    // from Jakarta midnight (days - 1) days ago, so "7 days" is today plus the six before it
    const todayStart = new Date(`${jakartaDay(new Date())}T00:00:00+07:00`);
    const from = new Date(todayStart.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
    const inRange = { status: { in: PAID_STATUSES }, paidAt: { gte: from } };

    const [paid, top, awaitingShipment, awaitingPayment, refundsNeeded, lowStock] = await Promise.all([
      this.prisma.order.findMany({ where: inRange, select: { total: true, paidAt: true } }),
      this.prisma.orderItem.groupBy({
        by: ['slug', 'name'],
        where: { order: inRange },
        _sum: { quantity: true, lineTotal: true },
        orderBy: { _sum: { lineTotal: 'desc' } },
        take: 5,
      }),
      this.prisma.order.count({ where: { status: OrderStatus.PAID } }),
      this.prisma.order.count({
        where: { status: OrderStatus.PENDING_PAYMENT, paymentExpiresAt: { gt: new Date() } },
      }),
      this.prisma.order.count({ where: { refundStatus: RefundStatus.NEEDED } }),
      this.prisma.product.findMany({
        where: { isActive: true, stock: { lte: LOW_STOCK_THRESHOLD } },
        orderBy: [{ stock: 'asc' }, { name: 'asc' }],
        select: { slug: true, name: true, model: true, stock: true },
      }),
    ]);

    // every day in the range, including days without sales, so the chart has no gaps
    const buckets = new Map<string, { revenue: number; orders: number }>();
    for (let i = 0; i < days; i += 1) {
      buckets.set(jakartaDay(new Date(from.getTime() + i * 24 * 60 * 60 * 1000)), { revenue: 0, orders: 0 });
    }
    for (const o of paid) {
      const bucket = buckets.get(jakartaDay(o.paidAt!));
      if (!bucket) continue;
      bucket.revenue += o.total;
      bucket.orders += 1;
    }

    const revenue = paid.reduce((sum, o) => sum + o.total, 0);
    return {
      days,
      revenue,
      paidOrders: paid.length,
      averageOrderValue: paid.length ? Math.round(revenue / paid.length) : 0,
      daily: [...buckets].map(([date, b]) => ({ date, ...b })),
      topProducts: top.map((t) => ({
        slug: t.slug,
        name: t.name,
        quantity: t._sum.quantity ?? 0,
        revenue: t._sum.lineTotal ?? 0,
      })),
      awaitingShipment,
      awaitingPayment,
      refundsNeeded,
      lowStock,
    };
  }
}
