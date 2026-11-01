import { randomUUID } from 'node:crypto';
import { createPrismaClient } from '../src/prisma/prisma-client.js';

/** Runs src/seed/bootstrap.ts as a production start does: the whole module, once. */
async function bootstrap(): Promise<{ logs: string[]; errors: string[] }> {
  const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  try {
    vi.resetModules();
    await import('../src/seed/bootstrap.js');
    return {
      logs: log.mock.calls.map((c) => String(c[0])),
      errors: error.mock.calls.map((c) => String(c[0])),
    };
  } finally {
    log.mockRestore();
    error.mockRestore();
  }
}

describe('Production start-up bootstrap (e2e)', () => {
  const prisma = createPrismaClient();
  const before = process.env['ADMIN_EMAIL'];
  const marker = randomUUID().slice(0, 8);
  const email = (kind: string) => `boot-${marker}-${kind}@test.example`;
  const user = (kind: string, data: { emailVerifiedAt?: Date | null; isDemo?: boolean } = {}) =>
    prisma.user.create({
      data: { email: email(kind), name: 'Boot', passwordHash: 'x', emailVerifiedAt: new Date(), ...data },
    });
  const roleOf = async (address: string) =>
    (await prisma.user.findUniqueOrThrow({ where: { email: address } })).role;

  afterEach(() => {
    if (before === undefined) delete process.env['ADMIN_EMAIL'];
    else process.env['ADMIN_EMAIL'] = before;
    vi.doUnmock('../src/prisma/prisma-client.js');
    vi.doUnmock('../src/seed/seed-database.js');
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { startsWith: `boot-${marker}-` } } });
    await prisma.$disconnect();
  });

  it('skips the seed when the catalogue is there, and changes no role without ADMIN_EMAIL', async () => {
    // empty rather than deleted: a deleted key would be filled again from a developer's .env
    process.env['ADMIN_EMAIL'] = '';
    const counts = async () => [await prisma.category.count(), await prisma.product.count()];
    const was = await counts();
    const admins = await prisma.user.count({ where: { role: 'ADMIN' } });
    expect(await bootstrap()).toEqual({ logs: ['bootstrap: catalogue present, seed skipped.'], errors: [] });
    expect(await counts()).toEqual(was);
    expect(await prisma.user.count({ where: { role: 'ADMIN' } })).toBe(admins);
  });

  it('makes a confirmed ADMIN_EMAIL account an administrator, written in any case, and only once', async () => {
    await user('owner');
    process.env['ADMIN_EMAIL'] = `  ${email('owner').toUpperCase()} `;
    expect((await bootstrap()).logs).toContain('bootstrap: ADMIN_EMAIL is now an administrator.');
    expect(await roleOf(email('owner'))).toBe('ADMIN');
    // the next start finds it done and says nothing more
    expect((await bootstrap()).logs).toEqual(['bootstrap: catalogue present, seed skipped.']);
  });

  it('leaves an unknown, unconfirmed or demo ADMIN_EMAIL as it is, saying why', async () => {
    process.env['ADMIN_EMAIL'] = email('nobody');
    expect((await bootstrap()).logs).toContain(
      'bootstrap: ADMIN_EMAIL has no account yet; sign up, confirm, then restart.',
    );

    await user('unconfirmed', { emailVerifiedAt: null });
    await user('demo', { isDemo: true });
    for (const kind of ['unconfirmed', 'demo']) {
      process.env['ADMIN_EMAIL'] = email(kind);
      expect((await bootstrap()).logs).toContain('bootstrap: ADMIN_EMAIL is not a confirmed, real account.');
      expect(await roleOf(email(kind))).toBe('CUSTOMER');
    }
  });

  describe('with the database replaced', () => {
    const fakeClient = (count: () => Promise<number>) => ({
      category: { count: vi.fn(count) },
      user: { findUnique: vi.fn() },
      $disconnect: vi.fn().mockResolvedValue(undefined),
    });

    it('seeds an empty database, and closes its connection', async () => {
      process.env['ADMIN_EMAIL'] = '';
      const client = fakeClient(() => Promise.resolve(0));
      const seedDatabase = vi.fn().mockResolvedValue('9 categories, 30 parts');
      vi.doMock('../src/prisma/prisma-client.js', () => ({ createPrismaClient: () => client }));
      vi.doMock('../src/seed/seed-database.js', () => ({ seedDatabase }));
      expect(await bootstrap()).toEqual({
        logs: ['bootstrap: empty database, seeded 9 categories, 30 parts.'],
        errors: [],
      });
      expect(seedDatabase).toHaveBeenCalledWith(client);
      expect(client.$disconnect).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['an error', new Error('connection refused'), 'connection refused'],
      ['anything else', 'socket closed', 'socket closed'],
    ])('logs %s and lets the API start anyway', async (_, thrown, shown) => {
      const client = fakeClient(() => Promise.reject(thrown));
      vi.doMock('../src/prisma/prisma-client.js', () => ({ createPrismaClient: () => client }));
      expect(await bootstrap()).toEqual({
        logs: [],
        errors: [`bootstrap failed, starting anyway: ${shown}`],
      });
      expect(client.$disconnect).toHaveBeenCalledTimes(1);
    });
  });
});
