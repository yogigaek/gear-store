import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  categorySchema,
  errorSchema,
  productDetailSchema,
  productPageSchema,
  productQuerySchema,
  type Category,
  type ProductDetail,
  type ProductPage,
  type ProductQuery,
} from '@gear-store/shared';
import { z } from 'zod';
import { ApiQueryFrom, openApiSchema } from '../common/openapi.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CatalogService } from './catalog.service.js';

const slugParam = z.string().regex(/^[a-z0-9-]{1,80}$/);

@ApiTags('Catalogue')
@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('categories')
  @ApiOperation({ summary: 'List categories with their number of active products' })
  @ApiOkResponse({ schema: openApiSchema(z.array(categorySchema)) })
  categories(): Promise<Category[]> {
    return this.catalog.categories();
  }

  @Get('products')
  @ApiOperation({ summary: 'Search, filter, sort and page through active products' })
  @ApiQueryFrom(productQuerySchema)
  @ApiOkResponse({ schema: openApiSchema(productPageSchema) })
  products(@Query(new ZodValidationPipe(productQuerySchema)) query: ProductQuery): Promise<ProductPage> {
    return this.catalog.products(query);
  }

  @Get('products/:slug')
  @ApiOperation({ summary: 'One active product with every spec and finish' })
  @ApiOkResponse({ schema: openApiSchema(productDetailSchema) })
  @ApiNotFoundResponse({ schema: openApiSchema(errorSchema) })
  product(@Param('slug', new ZodValidationPipe(slugParam)) slug: string): Promise<ProductDetail> {
    return this.catalog.product(slug);
  }
}
