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

describe('catalog query edges', () => {
  it('reads an empty or unknown-only query as the defaults', () => {
    expect(readCatalogQuery(new URLSearchParams(''))).toEqual({ sort: 'type', page: 1, pageSize: 12 });
    expect(readCatalogQuery(new URLSearchParams('__proto__=x&constructor=y&utm=z'))).toEqual({
      sort: 'type',
      page: 1,
      pageSize: 12,
    });
  });

  it('drops every bad parameter at once and keeps the good ones', () => {
    const q = readCatalogQuery(
      new URLSearchParams(
        'category=Bad Slug&q=%20&minPrice=-1&maxPrice=x&inStock=maybe&page=0&pageSize=49&sort=name',
      ),
    );
    expect(q).toEqual({ sort: 'name', page: 1, pageSize: 12 });
  });

  it('reads the last value of a parameter given twice', () => {
    expect(readCatalogQuery(new URLSearchParams('page=2&page=3')).page).toBe(3);
  });

  it('writes no empty, default or missing value', () => {
    expect(writeCatalogQuery({ q: '', category: undefined, inStock: false, page: 2 }).toString()).toBe(
      'inStock=false&page=2',
    );
  });

  it('gives the defaults instead of looping when a failure names no parameter', async () => {
    const { vi } = await import('vitest');
    vi.resetModules();
    vi.doMock('@gear-store/shared', async (actual) => {
      const shared = await actual<typeof import('@gear-store/shared')>();
      const failing = {
        safeParse: () => ({ success: false, error: { issues: [{ path: [] }] } }),
        parse: () => ({ sort: 'type', page: 1, pageSize: 12 }),
      };
      return { ...shared, productQuerySchema: failing };
    });
    const { readCatalogQuery: read } = await import('./catalog-query');
    expect(read(new URLSearchParams('page=2'))).toEqual({ sort: 'type', page: 1, pageSize: 12 });
    vi.doUnmock('@gear-store/shared');
  });
});
