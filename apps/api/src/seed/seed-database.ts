import { hash } from '@node-rs/argon2';
import { randomBytes } from 'node:crypto';
import type { PrismaClient } from '../generated/prisma/client.js';
import { seedCategories, seedConflicts, seedProducts } from './catalog.data.js';

// Idempotent: safe to run again; products are matched by slug and their specs, colours and conflicts rewritten.
export const demoAccounts = [
  { email: 'shopper@rakit.example', name: 'Demo Shopper', role: 'CUSTOMER' },
  { email: 'admin@rakit.example', name: 'Demo Admin', role: 'ADMIN' },
] as const;

/** Writes the demo catalogue and the two demo accounts. Returns what the database holds afterwards. */
export async function seedDatabase(prisma: PrismaClient): Promise<string> {
  for (const c of seedCategories) {
    await prisma.category.upsert({ where: { slug: c.slug }, create: c, update: c });
  }
  const categoryIds = new Map(
    (await prisma.category.findMany({ select: { id: true, slug: true } })).map((c) => [c.slug, c.id]),
  );

  for (const p of seedProducts) {
    const categoryId = categoryIds.get(p.category);
    if (!categoryId) throw new Error(`Unknown category ${p.category} for ${p.slug}`);
    const fields = {
      name: p.name,
      model: p.model,
      module: p.module,
      description: p.description,
      price: p.price,
      stock: p.stock,
      categoryId,
    };
    await prisma.$transaction(async (tx) => {
      const product = await tx.product.upsert({
        where: { slug: p.slug },
        create: { slug: p.slug, ...fields },
        update: fields,
      });
      await tx.productSpec.deleteMany({ where: { productId: product.id } });
      await tx.productColor.deleteMany({ where: { productId: product.id } });
      await tx.productSpec.createMany({
        data: p.specs.map(([label, value], position) => ({
          productId: product.id,
          label,
          value,
          position,
          onPlate: position < 3,
        })),
      });
      await tx.productColor.createMany({
        data: (p.colors ?? []).map(([key, label, hex], position) => ({
          productId: product.id,
          key,
          label,
          hex,
          position,
        })),
      });
    });
  }

  // each pair stored once, the lower id first (the table's CHECK holds it to that)
  const ids = new Map(
    (
      await prisma.product.findMany({
        where: { slug: { in: seedConflicts.flatMap(([a, b]) => [a, b]) } },
        select: { id: true, slug: true },
      })
    ).map((p) => [p.slug, p.id]),
  );
  await prisma.$transaction([
    prisma.partConflict.deleteMany(),
    prisma.partConflict.createMany({
      data: seedConflicts.map(([a, b, reason]) => {
        const [aId, bId] = [ids.get(a), ids.get(b)];
        if (!aId || !bId) throw new Error(`Unknown part in conflict ${a} × ${b}`);
        return aId < bId ? { aId, bId, reason } : { aId: bId, bId: aId, reason };
      }),
    }),
  ]);

  // Demo accounts sign in through the one-click demo endpoint only: their password is random and discarded.
  for (const account of demoAccounts) {
    const passwordHash = await hash(randomBytes(32).toString('base64url'));
    await prisma.user.upsert({
      where: { email: account.email },
      create: { ...account, passwordHash, isDemo: true, emailVerifiedAt: new Date() },
      update: { name: account.name, role: account.role, isDemo: true },
    });
  }

  const [categories, products, users] = await Promise.all([
    prisma.category.count(),
    prisma.product.count(),
    prisma.user.count({ where: { isDemo: true } }),
  ]);
  return `${categories} categories, ${products} products, ${users} demo accounts`;
}
