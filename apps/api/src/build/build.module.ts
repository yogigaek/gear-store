import { Module } from '@nestjs/common';
import { BuildController } from './build.controller.js';
import { BuildService } from './build.service.js';

@Module({
  controllers: [BuildController],
  providers: [BuildService],
  exports: [BuildService],
})
export class BuildModule {}
