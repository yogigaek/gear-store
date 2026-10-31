import { createPrismaClient } from '../prisma/prisma-client.js';
import { seedDatabase } from './seed-database.js';

// npm run db:seed: (re)writes the demo catalogue. Idempotent, but it resets prices and stock of the demo
// products, so production uses bootstrap.ts, which seeds only an empty database.
const prisma = createPrismaClient();
try {
  console.log(`Seeded ${await seedDatabase(prisma)}.`);
} finally {
  await prisma.$disconnect();
}
