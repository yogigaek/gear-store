import type { PrismaService } from '../prisma/prisma.service.js';
import { AdminStatsService } from './admin-stats.service.js';

function serviceWith(paid: { total: number; paidAt: Date | null }[], top: object[] = []) {
  const prisma = {
    order: { findMany: vi.fn().mockResolvedValue(paid), count: vi.fn().mockResolvedValue(0) },
    orderItem: { groupBy: vi.fn().mockResolvedValue(top) },
    product: { findMany: vi.fn().mockResolvedValue([]) },
  };
  return { stats: new AdminStatsService(prisma as unknown as PrismaService), prisma };
}

describe('AdminStatsService', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('answers a range without sales with zeros for every day, not a division by zero', async () => {
    const { stats } = serviceWith([]);
    const result = await stats.stats(7);
    expect(result).toMatchObject({
      days: 7,
      revenue: 0,
      paidOrders: 0,
      averageOrderValue: 0,
      topProducts: [],
    });
    expect(result.daily).toHaveLength(7);
    expect(result.daily.every((d) => d.revenue === 0 && d.orders === 0)).toBe(true);
  });

  it('puts a payment on its Jakarta calendar day, which starts at 17:00 UTC', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-01T05:00:00Z') }); // noon in Jakarta
    const { stats } = serviceWith([
      { total: 100, paidAt: new Date('2026-10-31T16:59:00Z') }, // 23:59 on 31 October in Jakarta
      { total: 300, paidAt: new Date('2026-10-31T17:00:00Z') }, // 00:00 on 1 November in Jakarta
    ]);
    const result = await stats.stats(7);
    expect(result.daily.slice(-2)).toEqual([
      { date: '2026-10-31', revenue: 100, orders: 1 },
      { date: '2026-11-01', revenue: 300, orders: 1 },
    ]);
    expect(result).toMatchObject({ revenue: 400, paidOrders: 2, averageOrderValue: 200 });
  });

  it('reads the range from Jakarta midnight, days − 1 days back, and scopes every count to demo orders when asked', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-01T05:00:00Z') });
    const { stats, prisma } = serviceWith([]);
    await stats.stats(7, true);
    const where = prisma.order.findMany.mock.calls[0]![0].where;
    expect(where).toMatchObject({
      user: { isDemo: true },
      paidAt: { gte: new Date('2026-10-25T17:00:00Z') },
    });
    for (const [args] of prisma.order.count.mock.calls)
      expect(args.where).toMatchObject({ user: { isDemo: true } });
  });

  it('counts a best seller with no recorded sums as zero', async () => {
    const { stats } = serviceWith([], [{ slug: 'a', name: 'A', _sum: { quantity: null, lineTotal: null } }]);
    expect((await stats.stats(7)).topProducts).toEqual([{ slug: 'a', name: 'A', quantity: 0, revenue: 0 }]);
  });
});
