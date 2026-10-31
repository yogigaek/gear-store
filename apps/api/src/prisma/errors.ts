import { Prisma } from '../generated/prisma/client.js';

/** A unique constraint refused the write (Prisma P2002). */
export const isUniqueViolation = (e: unknown): boolean =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
