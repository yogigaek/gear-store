import type { Prisma } from '../generated/prisma/client.js';

/** The user columns a reply may be built from: never passwordHash. */
export const publicUserSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  emailVerifiedAt: true,
  isDemo: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

export type PublicUser = Prisma.UserGetPayload<{ select: typeof publicUserSelect }>;
