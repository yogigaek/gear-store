import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { BuildModule } from '../build/build.module.js';
import { CartController } from './cart.controller.js';
import { CartService } from './cart.service.js';

@Module({
  imports: [AuthModule, BuildModule],
  controllers: [CartController],
  providers: [CartService],
  exports: [CartService],
})
export class CartModule {}
