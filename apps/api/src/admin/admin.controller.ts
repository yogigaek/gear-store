import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import {
  adminCategoryInputSchema,
  adminCategorySchema,
  adminListQuerySchema,
  adminOrderQuerySchema,
  adminOrderRowSchema,
  adminOrderSchema,
  adminProductInputSchema,
  adminProductRowSchema,
  adminProductSchema,
  adminProductUpdateSchema,
  adminStatsQuerySchema,
  adminStatsSchema,
  adminUserRowSchema,
  orderNumberSchema,
  pageOf,
  productSlugSchema,
  roleInputSchema,
  shipInputSchema,
  type AdminCategoryInput,
  type AdminListQuery,
  type AdminOrderQuery,
  type AdminProductInput,
  type AdminProductUpdate,
  type ShipInput,
} from '@gear-store/shared';
import { z } from 'zod';
import { AccessTokenGuard, type AuthContext, CurrentAuth } from '../auth/access-token.guard.js';
import { ApiQueryFrom, openApiSchema } from '../common/openapi.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { clientIp } from '../common/client-ip.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { AdminCatalogService } from './admin-catalog.service.js';
import { AdminGuard } from './admin.guard.js';
import { AdminOrdersService } from './admin-orders.service.js';
import { AdminStatsService } from './admin-stats.service.js';
import { AdminUsersService } from './admin-users.service.js';

const pipe = <S extends z.ZodType>(schema: S) => new ZodValidationPipe(schema);
const slugParam = pipe(productSlugSchema);
const numberParam = pipe(orderNumberSchema);

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard, AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly stats: AdminStatsService,
    private readonly catalog: AdminCatalogService,
    private readonly orders: AdminOrdersService,
    private readonly users: AdminUsersService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /**
   * What this request looked like on arrival: the client address Express settled on and the forwarding headers
   * it came with. Used to set TRUST_PROXY to the real number of proxies in front of the API.
   */
  @Get('request-info')
  @ApiOperation({ summary: 'The forwarding headers and client address of this request (diagnostics)' })
  requestInfo(@Req() req: Request) {
    const h = (name: string) => req.headers[name] ?? null;
    return {
      clientIp: clientIp(req, this.env.CLIENT_IP_HEADERS, this.env.PROXY_SECRET),
      ip: req.ip,
      ips: req.ips,
      trustProxy: req.app.get('trust proxy') as unknown,
      forwardedFor: h('x-forwarded-for'),
      realIp: h('x-real-ip'),
      vercelForwardedFor: h('x-vercel-forwarded-for'),
      trueClientIp: h('true-client-ip'),
      cfConnectingIp: h('cf-connecting-ip'),
    };
  }

  @Get('stats')
  @ApiOperation({ summary: 'Revenue, orders, best sellers and what needs attention' })
  @ApiQueryFrom(adminStatsQuerySchema)
  @ApiOkResponse({ schema: openApiSchema(adminStatsSchema) })
  overview(@CurrentAuth() auth: AuthContext, @Query(pipe(adminStatsQuerySchema)) query: { days: number }) {
    return this.stats.stats(query.days, auth.isDemo);
  }

  // ── products ──

  @Get('products')
  @ApiOperation({ summary: 'All products, including those taken off sale' })
  @ApiQueryFrom(adminListQuerySchema)
  @ApiOkResponse({ schema: openApiSchema(pageOf(adminProductRowSchema)) })
  products(@Query(pipe(adminListQuerySchema)) query: AdminListQuery) {
    return this.catalog.products(query);
  }

  @Get('products/:slug')
  @ApiOkResponse({ schema: openApiSchema(adminProductSchema) })
  product(@Param('slug', slugParam) slug: string) {
    return this.catalog.product(slug);
  }

  @Post('products')
  @ApiOperation({ summary: 'Add a product' })
  @ApiBody({ schema: openApiSchema(adminProductInputSchema, 'input') })
  @ApiOkResponse({ schema: openApiSchema(adminProductSchema) })
  createProduct(@Body(pipe(adminProductInputSchema)) input: AdminProductInput) {
    return this.catalog.createProduct(input);
  }

  @Put('products/:slug')
  @ApiOperation({ summary: 'Replace a product; refused with 409 if it changed since it was loaded' })
  @ApiBody({ schema: openApiSchema(adminProductUpdateSchema, 'input') })
  @ApiOkResponse({ schema: openApiSchema(adminProductSchema) })
  updateProduct(
    @Param('slug', slugParam) slug: string,
    @Body(pipe(adminProductUpdateSchema)) input: AdminProductUpdate,
  ) {
    return this.catalog.updateProduct(slug, input);
  }

  // ── categories ──

  @Get('categories')
  @ApiOkResponse({ schema: openApiSchema(z.array(adminCategorySchema)) })
  categories() {
    return this.catalog.categories();
  }

  @Post('categories')
  @ApiBody({ schema: openApiSchema(adminCategoryInputSchema, 'input') })
  @ApiOkResponse({ schema: openApiSchema(adminCategorySchema) })
  createCategory(@Body(pipe(adminCategoryInputSchema)) input: AdminCategoryInput) {
    return this.catalog.createCategory(input);
  }

  @Put('categories/:slug')
  @ApiBody({ schema: openApiSchema(adminCategoryInputSchema, 'input') })
  @ApiOkResponse({ schema: openApiSchema(adminCategorySchema) })
  updateCategory(
    @Param('slug', slugParam) slug: string,
    @Body(pipe(adminCategoryInputSchema)) input: AdminCategoryInput,
  ) {
    return this.catalog.updateCategory(slug, input);
  }

  @Delete('categories/:slug')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete an empty category' })
  deleteCategory(@Param('slug', slugParam) slug: string) {
    return this.catalog.deleteCategory(slug);
  }

  // ── orders ──

  @Get('orders')
  @ApiQueryFrom(adminOrderQuerySchema)
  @ApiOkResponse({ schema: openApiSchema(pageOf(adminOrderRowSchema)) })
  listOrders(@CurrentAuth() auth: AuthContext, @Query(pipe(adminOrderQuerySchema)) query: AdminOrderQuery) {
    return this.orders.list(query, auth.isDemo);
  }

  @Get('orders/:number')
  @ApiOkResponse({ schema: openApiSchema(adminOrderSchema) })
  order(@CurrentAuth() auth: AuthContext, @Param('number', numberParam) number: string) {
    return this.orders.detail(number, auth.isDemo);
  }

  @Post('orders/:number/ship')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mark a paid order shipped, with courier and tracking number' })
  @ApiBody({ schema: openApiSchema(shipInputSchema, 'input') })
  @ApiOkResponse({ schema: openApiSchema(adminOrderSchema) })
  ship(@Param('number', numberParam) number: string, @Body(pipe(shipInputSchema)) input: ShipInput) {
    return this.orders.ship(number, input);
  }

  @Post('orders/:number/deliver')
  @HttpCode(200)
  @ApiOkResponse({ schema: openApiSchema(adminOrderSchema) })
  deliver(@Param('number', numberParam) number: string) {
    return this.orders.deliver(number);
  }

  @Post('orders/:number/refund')
  @HttpCode(200)
  @ApiOperation({ summary: 'Record that a late payment was refunded' })
  @ApiOkResponse({ schema: openApiSchema(adminOrderSchema) })
  refund(@Param('number', numberParam) number: string) {
    return this.orders.markRefunded(number);
  }

  // ── customers ──

  @Get('users')
  @ApiQueryFrom(adminListQuerySchema)
  @ApiOkResponse({ schema: openApiSchema(pageOf(adminUserRowSchema)) })
  listUsers(@CurrentAuth() auth: AuthContext, @Query(pipe(adminListQuerySchema)) query: AdminListQuery) {
    return this.users.list(query, auth.isDemo);
  }

  @Patch('users/:id/role')
  @ApiBody({ schema: openApiSchema(roleInputSchema, 'input') })
  @ApiOkResponse({ schema: openApiSchema(adminUserRowSchema) })
  setRole(
    @CurrentAuth() auth: AuthContext,
    @Param('id', pipe(z.uuid())) id: string,
    @Body(pipe(roleInputSchema)) input: z.infer<typeof roleInputSchema>,
  ) {
    return this.users.setRole(auth.userId, id, input.role);
  }
}
