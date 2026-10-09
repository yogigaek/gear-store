import { createHash, randomBytes } from 'node:crypto';

/** 32 random bytes as base64url (43 characters): refresh tokens and email-link tokens. */
export function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Tokens are stored as SHA-256 hashes, so a database leak does not hand out working sessions or links. */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
