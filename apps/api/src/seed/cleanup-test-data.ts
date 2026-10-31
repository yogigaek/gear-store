import { createPrismaClient } from '../prisma/prisma-client.js';

// Removes every account on the reserved test domain (@test.example) with its orders, and gives back the
// stock those orders held, so local data looks as it did before a browser test run.
// Usage: npm run test-data:clean -w @gear-store/api
const prisma = createPrismaClient();
const where = { user: { email: { endsWith: '@test.example' } } };
try {
  const held = await prisma.orderItem.groupBy({
    by: ['productId'],
    where: {
      productId: { not: null },
      order: { ...where, status: { in: ['PENDING_PAYMENT', 'PAID', 'SHIPPED', 'DELIVERED'] } },
    },
    _sum: { quantity: true },
  });
  await prisma.$transaction([
    ...held.map((h) =>
      prisma.product.update({
        where: { id: h.productId! },
        data: { stock: { increment: h._sum.quantity ?? 0 } },
      }),
    ),
    prisma.order.deleteMany({ where }),
    prisma.user.deleteMany({ where: { email: { endsWith: '@test.example' } } }),
  ]);
  console.log(`Removed test accounts; returned stock for ${held.length} product(s).`);
} finally {
  await prisma.$disconnect();
}
