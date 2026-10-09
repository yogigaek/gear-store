import { Body, Controller, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { orderDetailSchema, orderNumberSchema, type OrderDetail } from '@gear-store/shared';
import { z } from 'zod';
import { AccessTokenGuard, type AuthContext, CurrentAuth } from '../auth/access-token.guard.js';
import { openApiSchema } from '../common/openapi.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { PaymentsService } from './payments.service.js';

const numberParam = new ZodValidationPipe(orderNumberSchema);

@ApiTags('Payments')
@Controller()
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('me/orders/:number/pay')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the Midtrans payment page for a waiting order' })
  @ApiOkResponse({ schema: openApiSchema(z.object({ redirectUrl: z.url() })) })
  pay(@CurrentAuth() auth: AuthContext, @Param('number', numberParam) number: string) {
    return this.payments.start(auth.userId, number);
  }

  @Post('me/orders/:number/payment-status')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Ask Midtrans for the latest payment status and update the order' })
  @ApiOkResponse({ schema: openApiSchema(orderDetailSchema) })
  status(
    @CurrentAuth() auth: AuthContext,
    @Param('number', numberParam) number: string,
  ): Promise<OrderDetail> {
    return this.payments.refresh(auth.userId, number);
  }

  /** Midtrans calls this from its own servers; the signature, not a session, proves who sent it. */
  @Post('payments/midtrans/notification')
  @HttpCode(200)
  @SkipThrottle()
  @ApiExcludeEndpoint()
  async notification(@Body() payload: unknown): Promise<{ outcome: string }> {
    return { outcome: await this.payments.notification(payload) };
  }
}
