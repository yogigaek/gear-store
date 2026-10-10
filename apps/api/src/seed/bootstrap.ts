import { PrismaPg } from '@prisma/adapter-pg';
import { loadEnv } from '../config/env.js';
import { PrismaClient } from '../generated/prisma/client.js';
import { seedDatabase } from './seed-database.js';

/**
 * Runs on every production start, after the migrations:
 *  - seeds the demo catalogue only while the database has no categories, so later admin edits survive deploys;
 *  - makes ADMIN_EMAIL an administrator once that account exists and is confirmed (sign up first, then restart).
 * Nothing here fails the start: a problem is logged and the API boots anyway.
 */
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: loadEnv().DATABASE_URL }) });
try {
  if ((await prisma.category.count()) === 0) {
    console.log(`bootstrap: empty database, seeded ${await seedDatabase(prisma)}.`);
  } else {
    console.log('bootstrap: catalogue present, seed skipped.');
  }

  const adminEmail = process.env['ADMIN_EMAIL']?.trim().toLowerCase();
  if (adminEmail) {
    const user = await prisma.user.findUnique({ where: { email: adminEmail } });
    if (!user) console.log('bootstrap: ADMIN_EMAIL has no account yet; sign up, confirm, then restart.');
    else if (user.isDemo || !user.emailVerifiedAt)
      console.log('bootstrap: ADMIN_EMAIL is not a confirmed, real account.');
    else if (user.role !== 'ADMIN') {
      await prisma.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } });
      console.log('bootstrap: ADMIN_EMAIL is now an administrator.');
    }
  }
} catch (error) {
  console.error(
    `bootstrap failed, starting anyway: ${error instanceof Error ? error.message : String(error)}`,
  );
} finally {
  await prisma.$disconnect();
}
