import { z } from 'zod';
import { ApiQueryFrom, openApiSchema } from './openapi.js';

const paramsOf = (schema: z.ZodType) => {
  class Probe {
    handler() {}
  }
  const descriptor = Object.getOwnPropertyDescriptor(Probe.prototype, 'handler')!;
  ApiQueryFrom(schema)(Probe.prototype, 'handler', descriptor);
  // where @nestjs/swagger keeps @ApiQuery entries (DECORATORS.API_PARAMETERS, not a public export)
  return Reflect.getMetadata('swagger/apiParameters', descriptor.value) as object[];
};

describe('openApiSchema', () => {
  it('drops the $schema key and keeps the shape', () => {
    const json = openApiSchema(z.object({ slug: z.string().max(80) }));
    expect(json).not.toHaveProperty('$schema');
    expect(json.properties).toEqual({ slug: { type: 'string', maxLength: 80 } });
    expect(json.required).toEqual(['slug']);
  });
});

describe('ApiQueryFrom', () => {
  it('documents one query parameter per field, required only where the schema requires it', () => {
    const params = paramsOf(z.object({ q: z.string(), page: z.coerce.number().optional() }));
    expect(params).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'q', required: true, in: 'query' }),
        expect.objectContaining({ name: 'page', required: false, in: 'query' }),
      ]),
    );
  });

  it('documents a schema whose fields are all optional', () => {
    const params = paramsOf(z.object({ q: z.string().optional() }));
    expect(params).toEqual([expect.objectContaining({ name: 'q', required: false })]);
  });
});
