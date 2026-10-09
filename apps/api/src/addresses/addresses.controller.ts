import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { addressInputSchema, addressSchema, type Address } from '@gear-store/shared';
import { z } from 'zod';
import { AccessTokenGuard, type AuthContext, CurrentAuth } from '../auth/access-token.guard.js';
import { openApiSchema } from '../common/openapi.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { AddressesService } from './addresses.service.js';

const idParam = new ZodValidationPipe(z.uuid());
const body = new ZodValidationPipe(addressInputSchema);

@ApiTags('Account')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@Controller('me/addresses')
export class AddressesController {
  constructor(private readonly addresses: AddressesService) {}

  @Get()
  @ApiOperation({ summary: 'Saved shipping addresses, default first, each with its shipping fee' })
  @ApiOkResponse({ schema: openApiSchema(z.array(addressSchema)) })
  list(@CurrentAuth() auth: AuthContext): Promise<Address[]> {
    return this.addresses.list(auth.userId);
  }

  @Post()
  @ApiOperation({ summary: 'Add an address (the first one becomes the default)' })
  @ApiBody({ schema: openApiSchema(addressInputSchema, 'input') })
  @ApiOkResponse({ schema: openApiSchema(addressSchema) })
  create(
    @CurrentAuth() auth: AuthContext,
    @Body(body) input: z.output<typeof addressInputSchema>,
  ): Promise<Address> {
    return this.addresses.create(auth.userId, input);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Replace an address' })
  @ApiBody({ schema: openApiSchema(addressInputSchema, 'input') })
  @ApiOkResponse({ schema: openApiSchema(addressSchema) })
  update(
    @CurrentAuth() auth: AuthContext,
    @Param('id', idParam) id: string,
    @Body(body) input: z.output<typeof addressInputSchema>,
  ): Promise<Address> {
    return this.addresses.update(auth.userId, id, input);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete an address; the oldest remaining one becomes the default' })
  remove(@CurrentAuth() auth: AuthContext, @Param('id', idParam) id: string): Promise<void> {
    return this.addresses.remove(auth.userId, id);
  }
}
