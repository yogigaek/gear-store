import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  brandSchema,
  categorySchema,
  errorSchema,
  productDetailSchema,
  productPageSchema,
  productQuerySchema,
  productSlugSchema,
  type Brand,
  type Category,
  type ProductDetail,
  type ProductPage,
  type ProductQuery,
} from '@gear-store/shared';
import { z } from 'zod';
import { ApiQueryFrom, openApiSchema } from '../common/openapi.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CatalogService } from './catalog.service.js';

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

  @Get('brands')
  @ApiOperation({ summary: 'Brands with active products, for the catalogue filter' })
  @ApiOkResponse({ schema: openApiSchema(z.array(brandSchema)) })
  brands(): Promise<Brand[]> {
    return this.catalog.brands();
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
  product(@Param('slug', new ZodValidationPipe(productSlugSchema)) slug: string): Promise<ProductDetail> {
    return this.catalog.product(slug);
  }
}
