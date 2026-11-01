import { describe, expect, it } from 'vitest';
import {
  authResponseSchema,
  changePasswordSchema,
  demoLoginSchema,
  emailLinkTokenSchema,
  emailOnlySchema,
  emailSchema,
  loginSchema,
  nativeAuthResponseSchema,
  passwordSchema,
  refreshTokenInputSchema,
  registerSchema,
  resetPasswordSchema,
  tokenOnlySchema,
  updateProfileSchema,
  userSchema,
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

  it.each([
    ['42 characters', 'A'.repeat(42)],
    ['a "+"', `${'A'.repeat(42)}+`],
    ['a "/"', `${'A'.repeat(42)}/`],
    ['a "="', `${'A'.repeat(42)}=`],
  ])('rejects a refresh token with %s (base64, not base64url, or cut short)', (_, refreshToken) => {
    expect(refreshTokenInputSchema.safeParse({ refreshToken }).success).toBe(false);
  });

  it('round-trips a native sign-in reply', () => {
    const reply = {
      accessToken: 'header.payload.signature',
      expiresIn: 900,
      user: {
        id: '0199e0a4-7b1c-7cc2-9d1e-3f5a6b7c8d9e',
        email: 'ana@test.example',
        name: 'Ana',
        role: 'CUSTOMER',
        emailVerified: true,
        isDemo: false,
      },
      refreshToken: 'A'.repeat(43),
      refreshExpiresAt: new Date('2026-11-27T00:00:00.000Z').toISOString(),
    };
    const parsed = nativeAuthResponseSchema.parse(JSON.parse(JSON.stringify(reply)));
    expect(parsed).toEqual(reply);
    expect(nativeAuthResponseSchema.safeParse({ ...reply, refreshExpiresAt: 'tomorrow' }).success).toBe(
      false,
    );
    const { refreshToken: _, ...withoutToken } = reply;
    expect(nativeAuthResponseSchema.safeParse(withoutToken).success).toBe(false);
  });

  it('only accepts 43-character base64url link tokens', () => {
    expect(emailLinkTokenSchema.safeParse('A'.repeat(43)).success).toBe(true);
    expect(emailLinkTokenSchema.safeParse('A'.repeat(42)).success).toBe(false);
    expect(emailLinkTokenSchema.safeParse(`${'A'.repeat(42)}/`).success).toBe(false);
  });
});

describe('auth schema boundaries', () => {
  const user = {
    id: crypto.randomUUID(),
    email: 'ana@test.example',
    name: 'Ana',
    role: 'CUSTOMER',
    emailVerified: false,
    isDemo: false,
  };

  it('takes an email of up to 254 characters, counted after trimming', () => {
    const at254 = `${'a'.repeat(244)}@b.example`;
    expect(at254).toHaveLength(254);
    expect(emailSchema.safeParse(at254).success).toBe(true);
    expect(emailSchema.safeParse(`  ${at254}  `).success).toBe(true);
    expect(emailSchema.safeParse(`a${at254}`).success).toBe(false);
  });

  it.each([
    '',
    '   ',
    'ana@test.example\nBcc: eve@evil.example',
    'ana @test.example',
    'ana@test..example',
    42,
  ])('rejects email %j', (email) => {
    expect(emailSchema.safeParse(email).success).toBe(false);
  });

  it('takes a password of exactly 8 or 128 characters, and counts spaces', () => {
    expect(passwordSchema.safeParse('x'.repeat(128)).success).toBe(true);
    expect(passwordSchema.safeParse('        ').success).toBe(true);
    expect(passwordSchema.safeParse('x'.repeat(7)).error?.issues[0]?.message).toBe(
      'Use at least 8 characters',
    );
    expect(passwordSchema.safeParse('x'.repeat(129)).error?.issues[0]?.message).toBe(
      'Use at most 128 characters',
    );
  });

  it('signs in with a password of any length up to 128, set under an older rule', () => {
    const login = { email: 'Ana@Test.Example', password: 'short' };
    expect(loginSchema.parse(login)).toEqual({ email: 'ana@test.example', password: 'short' });
    expect(loginSchema.safeParse({ ...login, password: '' }).success).toBe(false);
    expect(loginSchema.safeParse({ ...login, password: 'x'.repeat(129) }).success).toBe(false);
  });

  it('knows the two demo roles only, as written', () => {
    expect(demoLoginSchema.safeParse({ role: 'shopper' }).success).toBe(true);
    expect(demoLoginSchema.safeParse({ role: 'admin' }).success).toBe(true);
    for (const role of ['ADMIN', 'customer', '', undefined])
      expect(demoLoginSchema.safeParse({ role }).success).toBe(false);
  });

  it('takes a name of 1 to 80 characters after trimming', () => {
    expect(updateProfileSchema.safeParse({ name: 'x'.repeat(80) }).success).toBe(true);
    expect(updateProfileSchema.safeParse({ name: `  ${'x'.repeat(80)}  ` }).success).toBe(true);
    expect(updateProfileSchema.safeParse({ name: 'x'.repeat(81) }).success).toBe(false);
    expect(updateProfileSchema.safeParse({ name: '\t\n' }).error?.issues[0]?.message).toBe('Enter your name');
  });

  it('changes a password with any current one and a new one under today’s rule', () => {
    expect(
      changePasswordSchema.safeParse({ currentPassword: 'old', newPassword: 'x'.repeat(8) }).success,
    ).toBe(true);
    expect(changePasswordSchema.safeParse({ currentPassword: '', newPassword: 'x'.repeat(8) }).success).toBe(
      false,
    );
    expect(
      changePasswordSchema.safeParse({ currentPassword: 'old', newPassword: 'x'.repeat(7) }).success,
    ).toBe(false);
  });

  it('needs a link token for a reset, and an email alone for a resend', () => {
    const token = 'A'.repeat(43);
    expect(tokenOnlySchema.safeParse({ token }).success).toBe(true);
    expect(tokenOnlySchema.safeParse({ token: ` ${token}` }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ token, password: 'x'.repeat(8) }).success).toBe(true);
    expect(
      resetPasswordSchema.safeParse({ token: 'A'.repeat(43) + '\n', password: 'x'.repeat(8) }).success,
    ).toBe(false);
    expect(emailOnlySchema.parse({ email: ' A@B.CO ' })).toEqual({ email: 'a@b.co' });
  });

  it('reads an access token that lives at least a second, for a known role', () => {
    const reply = { accessToken: 'jwt', expiresIn: 1, user };
    expect(authResponseSchema.safeParse(reply).success).toBe(true);
    for (const expiresIn of [0, -1, 1.5])
      expect(authResponseSchema.safeParse({ ...reply, expiresIn }).success).toBe(false);
    expect(userSchema.safeParse({ ...user, role: 'SUPERUSER' }).success).toBe(false);
    expect(userSchema.safeParse({ ...user, id: 'user-1' }).success).toBe(false);
  });
});
