import { describe, expect, it } from 'vitest';
import { readCatalogQuery, writeCatalogQuery } from './catalog-query';

describe('catalog query in the URL', () => {
  it('reads valid parameters', () => {
    const q = readCatalogQuery(new URLSearchParams('category=batteries&sort=price-asc&page=2&inStock=true'));
    expect(q).toMatchObject({ category: 'batteries', sort: 'price-asc', page: 2, inStock: true });
  });

  it('drops only the invalid parameters', () => {
    const q = readCatalogQuery(new URLSearchParams('category=batteries&page=-3&sort=random&pageSize=9999'));
    expect(q).toEqual({ category: 'batteries', sort: 'type', page: 1, pageSize: 12 });
  });

  it('drops a min price above the max price', () => {
    const q = readCatalogQuery(new URLSearchParams('minPrice=900000&maxPrice=100000'));
    expect(q.minPrice).toBeUndefined();
    expect(q.maxPrice).toBe(100000);
  });

  it('writes short URLs without defaults', () => {
    expect(writeCatalogQuery({ sort: 'type', page: 1, pageSize: 12, category: 'forks' }).toString()).toBe(
      'category=forks',
    );
  });

  it('round-trips', () => {
    const query = { category: 'cockpits', q: 'carbon bar', minPrice: 100000, sort: 'name', page: 3 } as const;
    expect(readCatalogQuery(writeCatalogQuery(query))).toMatchObject(query);
  });
});
