import { PrismaPg } from '@prisma/adapter-pg';
import { loadEnv } from '../config/env.js';
import { PrismaClient } from '../generated/prisma/client.js';

// Usage: npm run admin:grant -w @gear-store/api -- you@example.com
// Makes an existing, confirmed account an administrator. There is no web route for the first admin on purpose.
const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error(
    'Give the email of an existing account: npm run admin:grant -w @gear-store/api -- you@example.com',
  );
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: loadEnv().DATABASE_URL }) });
try {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error(`No account for ${email}. Sign up first.`);
  if (user.isDemo) throw new Error('Demo accounts keep their role.');
  if (!user.emailVerifiedAt) throw new Error('Confirm the email address first.');
  await prisma.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } });
  console.log(`${email} is now an administrator.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
