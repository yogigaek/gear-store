import type { INestApplication, NestApplicationOptions } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import type { Env } from './config/env.js';
import { PrismaExceptionFilter } from './prisma/prisma-exception.filter.js';

/** JSON bodies only: Nest's default form parser would let another site post a sign-in form (login CSRF). */
export const APP_OPTIONS: NestApplicationOptions = { bodyParser: false };

/** Everything main.ts applies to the app, shared with the e2e tests so they exercise the same stack. */
export function configureApp(app: INestApplication, env: Env): void {
  const express = app as NestExpressApplication;
  // req.ip must be the visitor, or every rate limit would count the whole site as one client
  express.set('trust proxy', env.TRUST_PROXY);
  // tokens and sessions never sit in a cache; set first, so replies refused by the body parser or a throttle carry it
  express.use('/api/auth', (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  // nothing the API accepts comes close to this; a smaller limit makes oversized bodies cheap to refuse
  express.useBodyParser('json', { limit: '32kb' });
  express.disable('x-powered-by');
  app.use(helmet());
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new PrismaExceptionFilter(app.getHttpAdapter()));
  app.enableCors({ origin: env.WEB_ORIGIN, credentials: true });

  const config = new DocumentBuilder()
    .setTitle('Rakit API')
    .setDescription('Storefront, accounts and orders for the Rakit demo store.')
    .setVersion('0.2.0')
    .build();
  SwaggerModule.setup('api/docs', app, () => SwaggerModule.createDocument(app, config), {
    jsonDocumentUrl: 'api/openapi.json',
  });
}
