import { Body, Controller, Delete, Get, HttpCode, Param, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  myReviewSchema,
  productReviewsSchema,
  productSlugSchema,
  reviewInputSchema,
  reviewSchema,
  type MyReview,
  type ProductReviews,
  type Review,
  type ReviewInput,
} from '@gear-store/shared';
import { AccessTokenGuard, type AuthContext, CurrentAuth } from '../auth/access-token.guard.js';
import { openApiSchema } from '../common/openapi.js';
import { TEN_PER_MINUTE } from '../common/throttle.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ReviewsService } from './reviews.service.js';

const slugParam = new ZodValidationPipe(productSlugSchema);

@ApiTags('Reviews')
@Controller()
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get('products/:slug/reviews')
  @ApiOperation({ summary: 'Average, star distribution and the latest reviews of a product' })
  @ApiOkResponse({ schema: openApiSchema(productReviewsSchema) })
  forProduct(@Param('slug', slugParam) slug: string): Promise<ProductReviews> {
    return this.reviews.forProduct(slug);
  }

  @Get('me/reviews/:slug')
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Whether the signed-in customer may review this product, and their review if any',
  })
  @ApiOkResponse({ schema: openApiSchema(myReviewSchema) })
  mine(@CurrentAuth() auth: AuthContext, @Param('slug', slugParam) slug: string): Promise<MyReview> {
    return this.reviews.mine(auth.userId, slug);
  }

  @Put('me/reviews/:slug')
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  @Throttle(TEN_PER_MINUTE)
  @ApiOperation({ summary: 'Write or edit a review (paid orders only)' })
  @ApiBody({ schema: openApiSchema(reviewInputSchema, 'input') })
  @ApiOkResponse({ schema: openApiSchema(reviewSchema) })
  upsert(
    @CurrentAuth() auth: AuthContext,
    @Param('slug', slugParam) slug: string,
    @Body(new ZodValidationPipe(reviewInputSchema)) input: ReviewInput,
  ): Promise<Review> {
    return this.reviews.upsert(auth.userId, slug, input);
  }

  @Delete('me/reviews/:slug')
  @HttpCode(204)
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete your review of a product' })
  remove(@CurrentAuth() auth: AuthContext, @Param('slug', slugParam) slug: string): Promise<void> {
    return this.reviews.remove(auth.userId, slug);
  }
}
