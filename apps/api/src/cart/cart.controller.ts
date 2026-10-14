import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  cartBuildInputSchema,
  cartLineInputSchema,
  cartSchema,
  guestCartSchema,
  quantityInputSchema,
  type Cart,
  type CartBuildInput,
  type CartLineInput,
  type GuestCart,
  type QuantityInput,
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
  @ApiOperation({
    summary: 'Price a guest cart held by the browser: parts and bikes, at current prices and stock',
  })
  @ApiBody({ schema: openApiSchema(guestCartSchema, 'input') })
  @ApiOkResponse({ schema: openApiSchema(cartSchema) })
  quote(@Body(new ZodValidationPipe(guestCartSchema)) input: GuestCart): Promise<Cart> {
    return this.cart.quote(input);
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
  @ApiOperation({ summary: 'Set one part line to an exact quantity (0 removes it)' })
  @ApiBody({ schema: openApiSchema(cartLineInputSchema, 'input') })
  @ApiOkResponse({ schema: openApiSchema(cartSchema) })
  setLine(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(cartLineInputSchema)) input: CartLineInput,
  ): Promise<Cart> {
    return this.cart.setLine(auth.userId, input);
  }

  @Post('me/cart/builds')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add a bike: refused with 409 and the reason when it cannot be built as chosen' })
  @ApiBody({ schema: openApiSchema(cartBuildInputSchema, 'input') })
  @ApiOkResponse({ schema: openApiSchema(cartSchema) })
  addBuild(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(cartBuildInputSchema)) input: CartBuildInput,
  ): Promise<Cart> {
    return this.cart.addBuild(auth.userId, input);
  }

  @Put('me/cart/builds/:id')
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Set a bike in the cart to an exact quantity (0 removes it)' })
  @ApiBody({ schema: openApiSchema(quantityInputSchema, 'input') })
  @ApiOkResponse({ schema: openApiSchema(cartSchema) })
  setBuild(
    @CurrentAuth() auth: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(quantityInputSchema)) input: QuantityInput,
  ): Promise<Cart> {
    return this.cart.setBuildQuantity(auth.userId, id, input.quantity);
  }

  @Post('me/cart/merge')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add a guest cart to the signed-in cart after signing in' })
  @ApiBody({ schema: openApiSchema(guestCartSchema, 'input') })
  @ApiOkResponse({ schema: openApiSchema(cartSchema) })
  merge(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(guestCartSchema)) input: GuestCart,
  ): Promise<Cart> {
    return this.cart.merge(auth.userId, input);
  }
}
