import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { Env } from './config/env.js';

/** Everything main.ts applies to the app, shared with the e2e tests so they exercise the same stack. */
export function configureApp(app: INestApplication, env: Env): void {
  const express = app as NestExpressApplication;
  // one proxy in front in production (Render); req.ip must be the client, or rate limits hit everyone at once
  express.set('trust proxy', 1);
  express.disable('x-powered-by');
  app.use(helmet());
  app.use(cookieParser());
  app.setGlobalPrefix('api');
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
