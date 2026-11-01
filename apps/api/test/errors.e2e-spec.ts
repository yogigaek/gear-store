import { Logger, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { APP_OPTIONS, configureApp } from '../src/app.setup.js';
import { CatalogService } from '../src/catalog/catalog.service.js';
import { loadEnv } from '../src/config/env.js';
import { Prisma } from '../src/generated/prisma/client.js';
import { createPrismaClient } from '../src/prisma/prisma-client.js';

const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed on the fields: (`passwordHash`)', {
    code,
    clientVersion: Prisma.prismaVersion.client,
    meta: { modelName: 'User', target: ['passwordHash'] },
  });

describe('Database errors (e2e)', () => {
  let app: INestApplication<App>;
  let failure: Error;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CatalogService)
      .useValue({ categories: () => Promise.reject(failure) })
      .compile();
    app = moduleRef.createNestApplication<INestApplication<App>>(APP_OPTIONS);
    configureApp(app, loadEnv());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const categories = () => request(app.getHttpServer()).get('/api/categories');

  it.each([
    ['P2002', 409],
    ['P2025', 404],
  ])('answers Prisma %s with %i and a plain message', async (code, status) => {
    failure = prismaError(code);
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    try {
      const res = await categories().expect(status);
      expect(res.body).toEqual({ statusCode: status, message: expect.any(String) });
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|constraint|Prisma|P20/i);
      // still visible on the server: the code and the model, never the values
      const lines = warn.mock.calls.map((c) => String(c[0]));
      expect(lines).toEqual([expect.stringMatching(new RegExp(`${code}.*User`))]);
      expect(lines[0]).not.toMatch(/passwordHash/);
    } finally {
      warn.mockRestore();
    }
  });

  it('names an unknown model in the log when Prisma gives none, still answering plainly', async () => {
    failure = new Prisma.PrismaClientKnownRequestError('Record to update not found.', {
      code: 'P2025',
      clientVersion: Prisma.prismaVersion.client,
    });
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    try {
      const res = await categories().expect(404);
      expect(res.body).toEqual({ statusCode: 404, message: 'Not found' });
      expect(warn.mock.calls.map((c) => String(c[0]))).toEqual(['P2025 on unknown model, answered 404']);
    } finally {
      warn.mockRestore();
    }
  });

  it('answers any other database error with a bare 500', async () => {
    failure = prismaError('P2003');
    const res = await categories().expect(500);
    expect(res.body).toEqual({ statusCode: 500, message: 'Internal server error' });
  });

  it('connects the scripts’ own client to the same database', async () => {
    const client = createPrismaClient();
    try {
      expect(await client.$queryRaw<{ ok: number }[]>`SELECT 1 AS ok`).toEqual([{ ok: 1 }]);
    } finally {
      await client.$disconnect();
    }
  });
});
