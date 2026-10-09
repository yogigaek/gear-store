import type { Response } from 'express';
import { HealthController } from './health.controller.js';
import type { PrismaService } from '../prisma/prisma.service.js';

function fakeResponse() {
  const res = { status: vi.fn() };
  return res as unknown as Response & { status: ReturnType<typeof vi.fn> };
}

describe('HealthController', () => {
  it('reports ok when the database answers', async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]) } as unknown as PrismaService;
    const res = fakeResponse();
    await expect(new HealthController(prisma).check(res)).resolves.toEqual({ status: 'ok', database: 'up' });
    expect(res.status).not.toHaveBeenCalled();
  });

  it('answers 503 when the database is down', async () => {
    const prisma = {
      $queryRaw: vi.fn().mockRejectedValue(new Error('connection refused')),
    } as unknown as PrismaService;
    const res = fakeResponse();
    await expect(new HealthController(prisma).check(res)).resolves.toEqual({
      status: 'degraded',
      database: 'down',
    });
    expect(res.status).toHaveBeenCalledWith(503);
  });
});
