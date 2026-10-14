import type { z } from 'zod';
import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  buildCatalogSchema,
  buildQuoteSchema,
  buildQuoteInputSchema,
  type BuildCatalog,
  type BuildQuote,
} from '@gear-store/shared';
import { openApiSchema } from '../common/openapi.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { BuildService } from './build.service.js';

type BuildQuoteBody = z.output<typeof buildQuoteInputSchema>;

@ApiTags('Build')
@Controller('build')
export class BuildController {
  constructor(private readonly builds: BuildService) {}

  @Get()
  @ApiOperation({ summary: 'The E-1 build: slots with their parts, the starting choice, and conflicts' })
  @ApiOkResponse({ schema: openApiSchema(buildCatalogSchema) })
  catalog(): Promise<BuildCatalog> {
    return this.builds.catalog();
  }

  @Post('quote')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Check and price a chosen build',
    description:
      'Always answers 200: a build that cannot be made comes back with `problems` (empty slot, conflict, ' +
      'colour, stock) so the configurator can show why. Prices are today’s, from the database.',
  })
  @ApiBody({ schema: openApiSchema(buildQuoteInputSchema, 'input') })
  @ApiOkResponse({ schema: openApiSchema(buildQuoteSchema) })
  quote(
    @Body(new ZodValidationPipe(buildQuoteInputSchema)) { quantity, ...selection }: BuildQuoteBody,
  ): Promise<BuildQuote> {
    return this.builds.quote(selection, quantity);
  }
}
