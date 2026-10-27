import { describe, expect, it } from 'vitest';
import {
  emailLinkTokenSchema,
  emailSchema,
  passwordSchema,
  refreshTokenInputSchema,
  registerSchema,
} from './auth.js';

describe('auth schemas', () => {
  it('normalises email case and whitespace', () => {
    expect(emailSchema.parse('  Ana.Putri@Mail.COM ')).toBe('ana.putri@mail.com');
  });

  it.each(['not-an-email', 'a@', '@b.com', `${'a'.repeat(250)}@b.com`])('rejects email %s', (email) => {
    expect(emailSchema.safeParse(email).success).toBe(false);
  });

  it('accepts a long passphrase without symbols and rejects short or huge ones', () => {
    expect(passwordSchema.safeParse('correct horse battery').success).toBe(true);
    expect(passwordSchema.safeParse('short1!').success).toBe(false);
    // eight characters is the minimum
    expect(passwordSchema.safeParse('1234567').success).toBe(false);
    expect(passwordSchema.safeParse('12345678').success).toBe(true);
    expect(passwordSchema.safeParse('x'.repeat(129)).success).toBe(false);
  });

  it('trims the name and requires one', () => {
    expect(registerSchema.parse({ name: '  Ana ', email: 'a@b.co', password: 'long enough pw' }).name).toBe(
      'Ana',
    );
    expect(
      registerSchema.safeParse({ name: '   ', email: 'a@b.co', password: 'long enough pw' }).success,
    ).toBe(false);
  });

  it('only accepts a refresh token shaped like the ones the API issues', () => {
    expect(refreshTokenInputSchema.safeParse({ refreshToken: 'A'.repeat(43) }).success).toBe(true);
    expect(refreshTokenInputSchema.safeParse({ refreshToken: 'A'.repeat(44) }).success).toBe(false);
    expect(refreshTokenInputSchema.safeParse({ refreshToken: '' }).success).toBe(false);
  });

  it('only accepts 43-character base64url link tokens', () => {
    expect(emailLinkTokenSchema.safeParse('A'.repeat(43)).success).toBe(true);
    expect(emailLinkTokenSchema.safeParse('A'.repeat(42)).success).toBe(false);
    expect(emailLinkTokenSchema.safeParse(`${'A'.repeat(42)}/`).success).toBe(false);
  });
});
