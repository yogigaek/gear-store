import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { PrismaClient } from '../generated/prisma/client.js';
import { prismaOptions } from './prisma-client.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(@Inject(ENV) env: Env) {
    super(prismaOptions(env.DATABASE_URL));
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
