import { productQuerySchema, type ProductQuery } from '@gear-store/shared';

/**
 * The catalogue's filters live in the URL so a search can be shared and Back works. Hand-edited or stale
 * parameters are dropped one by one instead of failing the whole page.
 */
export function readCatalogQuery(params: URLSearchParams): ProductQuery {
  const raw: Record<string, string> = Object.fromEntries(params);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const parsed = productQuerySchema.safeParse(raw);
    if (parsed.success) return parsed.data;
    for (const issue of parsed.error.issues) delete raw[String(issue.path[0])];
  }
  return productQuerySchema.parse({});
}

/** URL parameters for a query, leaving out defaults so links stay short. */
export function writeCatalogQuery(query: Partial<ProductQuery>): URLSearchParams {
  const params = new URLSearchParams();
  const defaults = productQuerySchema.parse({});
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === '' || defaults[key as keyof ProductQuery] === value) continue;
    params.set(key, String(value));
  }
  return params;
}
