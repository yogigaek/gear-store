import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { loadEnv } from '../src/config/env.js';
import type { Mail } from '../src/mail/mail.service.js';
import { MailService } from '../src/mail/mail.service.js';
import { MidtransClient } from '../src/payments/midtrans.client.js';

/** Captures outgoing email instead of sending it. */
export class FakeMail {
  readonly sent: Mail[] = [];
  send(mail: Mail): Promise<void> {
    this.sent.push(mail);
    return Promise.resolve();
  }
  /** the token from the newest link sent to this address */
  lastToken(to: string): string {
    const mail = this.sent.findLast((m) => m.to === to);
    const token = mail?.text.match(/token=([A-Za-z0-9_-]{43})/)?.[1];
    if (!token) throw new Error(`No link emailed to ${to}`);
    return token;
  }
}

/** A fresh client address per test, so per-IP rate limits do not leak between tests. */
let ipCounter = 0;
export function nextIp(): string {
  ipCounter += 1;
  return `198.51.100.${ipCounter % 250}`;
}

/** The real app (same middleware as main.ts) against the database in DATABASE_URL, seeded with db:seed. */
export async function createTestApp(
  options: { mail?: FakeMail; midtrans?: object } = {},
): Promise<INestApplication<App>> {
  const builder = Test.createTestingModule({ imports: [AppModule] });
  if (options.mail) builder.overrideProvider(MailService).useValue(options.mail);
  if (options.midtrans) builder.overrideProvider(MidtransClient).useValue(options.midtrans);
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>();
  configureApp(app, loadEnv());
  await app.init();
  return app;
}

/** Registers, confirms and signs in a fresh customer; returns its access token. */
export async function signedInCustomer(
  app: INestApplication<App>,
  mail: FakeMail,
  ip: string,
): Promise<string> {
  const { default: request } = await import('supertest');
  const email = `user-${crypto.randomUUID()}@test.example`;
  const password = 'correct horse battery';
  const server = app.getHttpServer();
  await request(server)
    .post('/api/auth/register')
    .set('X-Forwarded-For', ip)
    .send({ name: 'Test', email, password });
  await request(server)
    .post('/api/auth/verify-email')
    .set('X-Forwarded-For', ip)
    .send({ token: mail.lastToken(email) });
  const res = await request(server)
    .post('/api/auth/login')
    .set('X-Forwarded-For', ip)
    .send({ email, password });
  return (res.body as { accessToken: string }).accessToken;
}

/** Removes test accounts. Orders are kept on purpose when accounts go (Restrict), so delete those first. */
export async function deleteTestUsers(app: INestApplication<App>): Promise<void> {
  const { PrismaService } = await import('../src/prisma/prisma.service.js');
  const { OrdersService } = await import('../src/orders/orders.service.js');
  const prisma = app.get(PrismaService);
  const orders = app.get(OrdersService);
  const where = { user: { email: { endsWith: '@test.example' } } };
  // a test that failed half-way can leave an order holding stock: close it the normal way first
  const pending = await prisma.order.findMany({
    where: { ...where, status: 'PENDING_PAYMENT' },
    select: { id: true },
  });
  for (const { id } of pending)
    await prisma.$transaction((tx) => orders.close(tx, id, 'CANCELLED', 'Test cleanup'));
  // paid orders keep their stock in real life; test ones give it back so repeated runs leave the seed data as it was
  const sold = await prisma.orderItem.groupBy({
    by: ['productId'],
    where: {
      productId: { not: null },
      order: { ...where, status: { in: ['PAID', 'SHIPPED', 'DELIVERED'] } },
    },
    _sum: { quantity: true },
  });
  for (const s of sold) {
    await prisma.product.update({
      where: { id: s.productId! },
      data: { stock: { increment: s._sum.quantity ?? 0 } },
    });
  }
  await prisma.order.deleteMany({ where });
  await prisma.user.deleteMany({ where: { email: { endsWith: '@test.example' } } });
}
