import { describe, expect, it } from 'vitest';
import { readCatalogQuery, writeCatalogQuery } from './catalog-query';

describe('catalog query in the URL', () => {
  it('reads valid parameters', () => {
    const q = readCatalogQuery(new URLSearchParams('category=audio&sort=price-asc&page=2&inStock=true'));
    expect(q).toMatchObject({ category: 'audio', sort: 'price-asc', page: 2, inStock: true });
  });

  it('drops only the invalid parameters', () => {
    const q = readCatalogQuery(new URLSearchParams('category=audio&page=-3&sort=random&pageSize=9999'));
    expect(q).toEqual({ category: 'audio', sort: 'newest', page: 1, pageSize: 12 });
  });

  it('drops a min price above the max price', () => {
    const q = readCatalogQuery(new URLSearchParams('minPrice=900000&maxPrice=100000'));
    expect(q.minPrice).toBeUndefined();
    expect(q.maxPrice).toBe(100000);
  });

  it('writes short URLs without defaults', () => {
    expect(writeCatalogQuery({ sort: 'newest', page: 1, pageSize: 12, category: 'power' }).toString()).toBe(
      'category=power',
    );
  });

  it('round-trips', () => {
    const query = { category: 'hubs', q: 'usb c', minPrice: 100000, sort: 'name', page: 3 } as const;
    expect(readCatalogQuery(writeCatalogQuery(query))).toMatchObject(query);
  });
});
