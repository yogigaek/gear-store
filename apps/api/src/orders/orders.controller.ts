import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  checkoutInputSchema,
  orderDetailSchema,
  orderNumberSchema,
  orderSummarySchema,
  type CheckoutInput,
  type OrderDetail,
  type OrderSummary,
} from '@gear-store/shared';
import { z } from 'zod';
import { AccessTokenGuard, type AuthContext, CurrentAuth } from '../auth/access-token.guard.js';
import { openApiSchema } from '../common/openapi.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { OrdersService } from './orders.service.js';

const numberParam = new ZodValidationPipe(orderNumberSchema);

@ApiTags('Orders')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@Controller('me/orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Place an order from the cart; a repeated idempotency key returns the same order',
  })
  @ApiBody({ schema: openApiSchema(checkoutInputSchema, 'input') })
  @ApiOkResponse({ schema: openApiSchema(orderDetailSchema) })
  checkout(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(checkoutInputSchema)) input: CheckoutInput,
  ): Promise<OrderDetail> {
    return this.orders.checkout(auth.userId, input);
  }

  @Get()
  @ApiOperation({ summary: 'Recent orders, newest first' })
  @ApiOkResponse({ schema: openApiSchema(z.array(orderSummarySchema)) })
  list(@CurrentAuth() auth: AuthContext): Promise<OrderSummary[]> {
    return this.orders.list(auth.userId);
  }

  @Get(':number')
  @ApiOperation({ summary: 'One order with its items, address and timeline' })
  @ApiOkResponse({ schema: openApiSchema(orderDetailSchema) })
  detail(
    @CurrentAuth() auth: AuthContext,
    @Param('number', numberParam) number: string,
  ): Promise<OrderDetail> {
    return this.orders.detail(auth.userId, number);
  }

  @Post(':number/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cancel an order that is still waiting for payment; its stock is released' })
  @ApiOkResponse({ schema: openApiSchema(orderDetailSchema) })
  cancel(
    @CurrentAuth() auth: AuthContext,
    @Param('number', numberParam) number: string,
  ): Promise<OrderDetail> {
    return this.orders.cancel(auth.userId, number);
  }
}
