import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { loadEnv } from './config/env.js';

async function bootstrap() {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.enableCors({ origin: env.WEB_ORIGIN, credentials: true });
  // SIGTERM from the host: finish requests in flight and close the database pool
  app.enableShutdownHooks();
  await app.listen(env.PORT);
}
await bootstrap();
