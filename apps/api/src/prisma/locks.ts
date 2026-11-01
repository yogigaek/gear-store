import type { Prisma } from '../generated/prisma/client.js';

/**
 * Checkout and every change to an account's cart, addresses or wishlist lock the account's row first, so they run
 * one after another: a checkout never empties lines written after it read the cart, and a limit counted before an
 * insert still holds after it. NO KEY UPDATE leaves the key free, so a mere reference (a new session) never waits.
 */
export async function lockAccount(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId}::uuid FOR NO KEY UPDATE`;
}

/** room for a transaction to queue on row locks behind checkouts (the shared demo shopper's most of all) */
export const LOCKED_WRITE = { maxWait: 10_000, timeout: 10_000 };
