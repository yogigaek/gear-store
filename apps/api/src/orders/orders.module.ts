import { Module } from '@nestjs/common';
import { AddressesModule } from '../addresses/addresses.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { BuildModule } from '../build/build.module.js';
import { CartModule } from '../cart/cart.module.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';

@Module({
  imports: [AuthModule, AddressesModule, CartModule, BuildModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
