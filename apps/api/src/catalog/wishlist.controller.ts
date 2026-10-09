import { Controller, Delete, Get, HttpCode, Param, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { productSlugSchema, wishlistSchema, type Wishlist } from '@gear-store/shared';
import { AccessTokenGuard, type AuthContext, CurrentAuth } from '../auth/access-token.guard.js';
import { openApiSchema } from '../common/openapi.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { WishlistService } from './wishlist.service.js';

@ApiTags('Account')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@Controller('me/wishlist')
export class WishlistController {
  constructor(private readonly wishlist: WishlistService) {}

  @Get()
  @ApiOperation({ summary: 'Saved products, newest first' })
  @ApiOkResponse({ schema: openApiSchema(wishlistSchema) })
  list(@CurrentAuth() auth: AuthContext): Promise<Wishlist> {
    return this.wishlist.list(auth.userId);
  }

  @Put(':slug')
  @HttpCode(204)
  @ApiOperation({ summary: 'Save a product (saving it twice is fine)' })
  add(
    @CurrentAuth() auth: AuthContext,
    @Param('slug', new ZodValidationPipe(productSlugSchema)) slug: string,
  ) {
    return this.wishlist.add(auth.userId, slug);
  }

  @Delete(':slug')
  @HttpCode(204)
  @ApiOperation({ summary: 'Remove a saved product (removing one that is not saved is fine)' })
  remove(
    @CurrentAuth() auth: AuthContext,
    @Param('slug', new ZodValidationPipe(productSlugSchema)) slug: string,
  ) {
    return this.wishlist.remove(auth.userId, slug);
  }
}
