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

  it('never echoes values in the error', () => {
    expect(() => loadEnv({ DATABASE_URL: 'mysql://u:secret-password@h/db' })).not.toThrow(/secret-password/);
    expect(() => loadEnv({ ...valid, JWT_ACCESS_SECRET: 'tiny-secret' })).not.toThrow(/tiny-secret/);
    expect(() => loadEnv({ ...valid, MIDTRANS_SERVER_KEY: 'short' })).not.toThrow(/short/);
  });
});
