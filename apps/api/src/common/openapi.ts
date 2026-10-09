import { applyDecorators } from '@nestjs/common';
import { ApiQuery, type ApiResponseSchemaHost } from '@nestjs/swagger';
import { z } from 'zod';

type SchemaObject = ApiResponseSchemaHost['schema'] & {
  properties?: Record<string, unknown>;
  required?: string[];
};

/** OpenAPI schema straight from the shared zod schema, so the docs cannot drift from validation. */
export function openApiSchema(schema: z.ZodType, io: 'input' | 'output' = 'output'): SchemaObject {
  const { $schema: _ignored, ...json } = z.toJSONSchema(schema, {
    target: 'openapi-3.0',
    io,
    unrepresentable: 'any',
  });
  return json as SchemaObject;
}

/** One @ApiQuery per field of a zod object schema. */
export function ApiQueryFrom(schema: z.ZodType) {
  const json = openApiSchema(schema, 'input');
  const required = new Set(json.required ?? []);
  return applyDecorators(
    ...Object.entries(json.properties ?? {}).map(([name, property]) =>
      ApiQuery({ name, required: required.has(name), schema: property as SchemaObject }),
    ),
  );
}
