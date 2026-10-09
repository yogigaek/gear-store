import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { loadEnv } from '../src/config/env.js';
import type { Mail } from '../src/mail/mail.service.js';
import { MailService } from '../src/mail/mail.service.js';

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
export async function createTestApp(options: { mail?: FakeMail } = {}): Promise<INestApplication<App>> {
  const builder = Test.createTestingModule({ imports: [AppModule] });
  if (options.mail) builder.overrideProvider(MailService).useValue(options.mail);
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>();
  configureApp(app, loadEnv());
  await app.init();
  return app;
}
