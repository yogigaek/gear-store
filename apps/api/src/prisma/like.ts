/** Search text for Prisma's `contains`, which puts it in a LIKE pattern as is: % and _ would match anything. */
export const literal = (text: string): string => text.replace(/[\\%_]/g, '\\$&');
