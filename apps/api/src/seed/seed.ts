import { PrismaPg } from '@prisma/adapter-pg';
import { loadEnv } from '../config/env.js';
import { PrismaClient } from '../generated/prisma/client.js';
import { seedDatabase } from './seed-database.js';

// npm run db:seed: (re)writes the demo catalogue. Idempotent, but it resets prices and stock of the demo
// products, so production uses bootstrap.ts, which seeds only an empty database.
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: loadEnv().DATABASE_URL }) });
try {
  console.log(`Seeded ${await seedDatabase(prisma)}.`);
} finally {
  await prisma.$disconnect();
}
