import { loadEnv } from './env.js';

const valid = {
  DATABASE_URL: 'postgresql://gear:secret-password@localhost:5436/gear',
  WEB_ORIGIN: 'http://localhost:5173',
  JWT_ACCESS_SECRET: 'x'.repeat(32),
  SMTP_URL: 'smtp://localhost:1025',
  MIDTRANS_SERVER_KEY: 'SB-Mid-server-test',
};

describe('loadEnv', () => {
  it('applies defaults', () => {
    const env = loadEnv(valid);
    expect(env.PORT).toBe(3000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.MIDTRANS_PRODUCTION).toBe(false);
  });

  it('coerces PORT', () => {
    expect(loadEnv({ ...valid, PORT: '8080' }).PORT).toBe(8080);
  });

  it.each([
    ['missing DATABASE_URL', { WEB_ORIGIN: valid.WEB_ORIGIN }, 'DATABASE_URL'],
    ['non-postgres DATABASE_URL', { ...valid, DATABASE_URL: 'mysql://u:p@h/db' }, 'DATABASE_URL'],
    ['missing WEB_ORIGIN', { DATABASE_URL: valid.DATABASE_URL }, 'WEB_ORIGIN'],
    ['bad PORT', { ...valid, PORT: 'eighty' }, 'PORT'],
    ['short JWT_ACCESS_SECRET', { ...valid, JWT_ACCESS_SECRET: 'short' }, 'JWT_ACCESS_SECRET'],
    ['non-SMTP SMTP_URL', { ...valid, SMTP_URL: 'https://mail.example' }, 'SMTP_URL'],
  ])('rejects %s', (_, source, field) => {
    expect(() => loadEnv(source)).toThrow(field);
  });

  describe('in production', () => {
    const production = {
      ...valid,
      NODE_ENV: 'production',
      JWT_ACCESS_SECRET: 'p'.repeat(48),
      MIDTRANS_SERVER_KEY: 'SB-Mid-server-real-sandbox-key',
    };

    it('boots with real values, in sandbox or production mode', () => {
      expect(loadEnv(production).NODE_ENV).toBe('production');
      const live = { ...production, MIDTRANS_PRODUCTION: 'true', MIDTRANS_SERVER_KEY: 'Mid-server-real-key' };
      expect(loadEnv(live).MIDTRANS_PRODUCTION).toBe(true);
    });

    it('accepts a sandbox key without the SB- prefix, as older Midtrans accounts have', () => {
      expect(
        loadEnv({ ...production, MIDTRANS_SERVER_KEY: 'Mid-server-real-sandbox-key' }).MIDTRANS_PRODUCTION,
      ).toBe(false);
    });

    it.each([
      [
        'the example JWT secret',
        { JWT_ACCESS_SECRET: 'change-me-to-at-least-32-random-characters' },
        'JWT_ACCESS_SECRET',
      ],
      [
        'a JWT secret built on the example',
        { JWT_ACCESS_SECRET: 'change-me-to-at-least-32-random-characters-2' },
        'JWT_ACCESS_SECRET',
      ],
      [
        'the example JWT secret in other case, with spaces',
        { JWT_ACCESS_SECRET: ' CHANGE-ME-TO-AT-LEAST-32-RANDOM-CHARACTERS' },
        'JWT_ACCESS_SECRET',
      ],
      [
        'the example Midtrans key',
        { MIDTRANS_SERVER_KEY: 'SB-Mid-server-REPLACE_ME' },
        'MIDTRANS_SERVER_KEY',
      ],
      [
        'the example Midtrans key in other case',
        { MIDTRANS_SERVER_KEY: 'SB-Mid-server-replace_me' },
        'MIDTRANS_SERVER_KEY',
      ],
    ])('refuses %s', (_, change, field) => {
      expect(() => loadEnv({ ...production, ...change })).toThrow(field);
    });

    it('leaves development and tests alone', () => {
      const example = { MIDTRANS_SERVER_KEY: 'SB-Mid-server-REPLACE_ME', MIDTRANS_PRODUCTION: 'true' };
      expect(() => loadEnv({ ...production, ...example, NODE_ENV: 'development' })).not.toThrow();
      expect(() => loadEnv({ ...production, ...example, NODE_ENV: 'test' })).not.toThrow();
    });
  });

  it('never echoes values in the error', () => {
    expect(() => loadEnv({ DATABASE_URL: 'mysql://u:secret-password@h/db' })).not.toThrow(/secret-password/);
    expect(() => loadEnv({ ...valid, JWT_ACCESS_SECRET: 'tiny-secret' })).not.toThrow(/tiny-secret/);
    expect(() => loadEnv({ ...valid, MIDTRANS_SERVER_KEY: 'short' })).not.toThrow(/short/);
  });
});
