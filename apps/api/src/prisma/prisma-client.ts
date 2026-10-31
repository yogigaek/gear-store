import { PrismaPg } from '@prisma/adapter-pg';
import { loadEnv } from '../config/env.js';
import { PrismaClient } from '../generated/prisma/client.js';

/** How every client connects: PrismaService in the app, createPrismaClient() in the scripts. */
export const prismaOptions = (databaseUrl: string) => ({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

/** A client for the scripts in seed/, which run outside Nest. */
export const createPrismaClient = (): PrismaClient => new PrismaClient(prismaOptions(loadEnv().DATABASE_URL));
