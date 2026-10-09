import { loadEnv } from './env.js';

const valid = {
  DATABASE_URL: 'postgresql://gear:secret-password@localhost:5436/gear',
  WEB_ORIGIN: 'http://localhost:5173',
};

describe('loadEnv', () => {
  it('applies defaults', () => {
    const env = loadEnv(valid);
    expect(env.PORT).toBe(3000);
    expect(env.NODE_ENV).toBe('development');
  });

  it('coerces PORT', () => {
    expect(loadEnv({ ...valid, PORT: '8080' }).PORT).toBe(8080);
  });

  it.each([
    ['missing DATABASE_URL', { WEB_ORIGIN: valid.WEB_ORIGIN }, 'DATABASE_URL'],
    ['non-postgres DATABASE_URL', { ...valid, DATABASE_URL: 'mysql://u:p@h/db' }, 'DATABASE_URL'],
    ['missing WEB_ORIGIN', { DATABASE_URL: valid.DATABASE_URL }, 'WEB_ORIGIN'],
    ['bad PORT', { ...valid, PORT: 'eighty' }, 'PORT'],
  ])('rejects %s', (_, source, field) => {
    expect(() => loadEnv(source)).toThrow(field);
  });

  it('never echoes values in the error', () => {
    expect(() => loadEnv({ DATABASE_URL: 'mysql://u:secret-password@h/db' })).not.toThrow(/secret-password/);
  });
});
