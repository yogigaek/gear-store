import { Body, Controller, Get, HttpCode, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  cartLineInputSchema,
  cartLinesSchema,
  cartSchema,
  type Cart,
  type CartLineInput,
  type CartLines,
} from '@gear-store/shared';
import { AccessTokenGuard, type AuthContext, CurrentAuth } from '../auth/access-token.guard.js';
import { openApiSchema } from '../common/openapi.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CartService } from './cart.service.js';

@ApiTags('Cart')
@Controller()
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Post('cart/quote')
  @HttpCode(200)
  @ApiOperation({ summary: 'Price a guest cart held by the browser (current prices and stock)' })
  @ApiBody({ schema: openApiSchema(cartLinesSchema, 'input') })
  @ApiOkResponse({ schema: openApiSchema(cartSchema) })
  quote(@Body(new ZodValidationPipe(cartLinesSchema)) input: CartLines): Promise<Cart> {
    return this.cart.quote(input.items);
  }

  @Get('me/cart')
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'The signed-in cart' })
  @ApiOkResponse({ schema: openApiSchema(cartSchema) })
  get(@CurrentAuth() auth: AuthContext): Promise<Cart> {
    return this.cart.get(auth.userId);
  }

  @Put('me/cart/items')
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Set one line to an exact quantity (0 removes it)' })
  @ApiBody({ schema: openApiSchema(cartLineInputSchema, 'input') })
  @ApiOkResponse({ schema: openApiSchema(cartSchema) })
  setLine(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(cartLineInputSchema)) input: CartLineInput,
  ): Promise<Cart> {
    return this.cart.setLine(auth.userId, input);
  }

  @Post('me/cart/merge')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add a guest cart to the signed-in cart after signing in' })
  @ApiBody({ schema: openApiSchema(cartLinesSchema, 'input') })
  @ApiOkResponse({ schema: openApiSchema(cartSchema) })
  merge(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(cartLinesSchema)) input: CartLines,
  ): Promise<Cart> {
    return this.cart.merge(auth.userId, input.items);
  }
}
