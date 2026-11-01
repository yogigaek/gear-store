import { keepPreviousData } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { product } from '../test/fixtures';
import { auth, call, fakeApi, fetchQuery, hooks, query, resetHooks } from '../test/query-hooks';
import {
  toSearchParams,
  useBuildCatalog,
  useBuildQuote,
  useCategories,
  useMyReview,
  useProduct,
  useProductReviews,
  useProducts,
  useSaveReview,
  useToggleWishlist,
  useWishlist,
} from './queries';

vi.mock('@tanstack/react-query', async (actual) =>
  (await import('../test/query-hooks')).mockReactQuery(
    await actual<typeof import('@tanstack/react-query')>(),
  ),
);
vi.mock('./auth-context', async () => {
  const { auth } = await import('../test/query-hooks');
  return { useAuth: () => auth };
});

const review = {
  id: crypto.randomUUID(),
  author: 'Ana P.',
  rating: 5,
  title: 'Good',
  body: 'Rides well.',
  createdAt: 'x',
  updatedAt: 'x',
};

beforeEach(resetHooks);
afterEach(() => vi.unstubAllGlobals());

describe('catalogue queries', () => {
  it('reads the categories and the build, kept fresh for a while', async () => {
    const sent = fakeApi({
      'GET /categories': () => [
        { slug: 'frames', name: 'Frames', description: '', slot: 0, productCount: 3 },
      ],
      'GET /build': () => ({ name: 'E-1', slots: [], conflicts: [], fromPrice: null }),
    });
    call(useCategories);
    call(useBuildCatalog);
    expect(query('categories').staleTime).toBe(300_000);
    expect(query('build').staleTime).toBe(60_000);
    expect(await fetchQuery(query('categories'))).toHaveLength(1);
    expect(await fetchQuery(query('build'))).toMatchObject({ name: 'E-1' });
    expect(sent.map((s) => s.auth)).toEqual([undefined, undefined]);
  });

  it('quotes a build only once one is chosen, keeping the last answer while the next loads', async () => {
    call(useBuildQuote, null);
    expect(query('build', 'quote').enabled).toBe(false);
    const input = { parts: { frames: 'e1-frame-m' }, colorKey: 'signal', quantity: 2 };
    const sent = fakeApi({
      'POST /build/quote': () => ({
        label: 'E-1',
        colorKey: 'signal',
        colorLabel: null,
        parts: [],
        unitPrice: 0,
        problems: [],
      }),
    });
    call(useBuildQuote, input);
    const q = query('build', 'quote', input);
    expect(q).toMatchObject({ enabled: true, placeholderData: keepPreviousData });
    await fetchQuery(q);
    expect(sent[0]!.body).toEqual(input);
  });

  it('turns a query into URL parameters, keeping 0 and false but not empty values', () => {
    expect(
      toSearchParams({ minPrice: 0, inStock: false, q: '', category: undefined, page: 2 }).toString(),
    ).toBe('minPrice=0&inStock=false&page=2');
    expect(toSearchParams({ q: 'a&b=c #1' }).toString()).toBe('q=a%26b%3Dc+%231');
    expect(toSearchParams({}).toString()).toBe('');
  });

  it('keys a product page by its query string and keeps the last page on screen', async () => {
    const sent = fakeApi({
      'GET /products?q=bar&page=2': () => ({ items: [], page: 2, pageSize: 12, total: 0 }),
    });
    call(useProducts, { q: 'bar', page: 2 });
    const q = query('products', 'q=bar&page=2');
    expect(q.placeholderData).toBe(keepPreviousData);
    expect(await fetchQuery(q)).toMatchObject({ page: 2 });
    expect(sent).toHaveLength(1);
  });

  it('encodes a slug in the path, so a hand-made one cannot reach another endpoint', async () => {
    const sent = fakeApi({});
    call(useProduct, '../admin/stats?x');
    call(useProductReviews, 'a/b');
    await expect(fetchQuery(query('product'))).rejects.toMatchObject({ status: 404 });
    await expect(fetchQuery(query('reviews'))).rejects.toMatchObject({ status: 404 });
    expect(sent.map((s) => s.path)).toEqual(['/products/..%2Fadmin%2Fstats%3Fx', '/products/a%2Fb/reviews']);
  });
});

describe('wishlist', () => {
  it('reads the wishlist only when signed in, with the token', async () => {
    auth.status = 'signed-out';
    call(useWishlist);
    expect(query('me', 'wishlist').enabled).toBe(false);
    auth.status = 'signed-in';
    const sent = fakeApi({ 'GET /me/wishlist': () => [product()] });
    call(useWishlist);
    expect(await fetchQuery(query('me', 'wishlist'))).toHaveLength(1);
    expect(sent[0]!.auth).toBe('Bearer t');
  });

  it('flips the heart at once: a saved part goes first, once', async () => {
    const key = ['me', 'wishlist'];
    hooks.client.setQueryData(key, [product('rear-rack'), product('fender-set')]);
    const sent = fakeApi({ 'PUT /me/wishlist/fender-set': () => undefined });
    const invalidate = vi.spyOn(hooks.client, 'invalidateQueries');
    await call(useToggleWishlist).mutateAsync({ product: product('fender-set'), save: true });
    expect(hooks.client.getQueryData<{ slug: string }[]>(key)!.map((p) => p.slug)).toEqual([
      'fender-set',
      'rear-rack',
    ]);
    expect(sent[0]!.method).toBe('PUT');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: key });
  });

  it('saves into a wishlist not read yet, and unsaves', async () => {
    const key = ['me', 'wishlist'];
    fakeApi({
      'PUT /me/wishlist/fender-set': () => undefined,
      'DELETE /me/wishlist/fender-set': () => undefined,
    });
    await call(useToggleWishlist).mutateAsync({ product: product(), save: true });
    expect(hooks.client.getQueryData(key)).toHaveLength(1);
    await call(useToggleWishlist).mutateAsync({ product: product(), save: false });
    expect(hooks.client.getQueryData(key)).toEqual([]);
  });

  it('puts the list back when the request fails', async () => {
    const key = ['me', 'wishlist'];
    const before = [product('rear-rack')];
    hooks.client.setQueryData(key, before);
    fakeApi({ 'PUT /me/wishlist/fender-set': () => new Response(null, { status: 500 }) });
    await expect(
      call(useToggleWishlist).mutateAsync({ product: product(), save: true }),
    ).rejects.toMatchObject({
      status: 500,
    });
    expect(hooks.client.getQueryData(key)).toEqual(before);
  });
});

describe('reviews', () => {
  it('asks for the shopper’s own review only when signed in', async () => {
    auth.status = 'restoring';
    call(useMyReview, 'fender-set');
    expect(query('me', 'review').enabled).toBe(false);
    auth.status = 'signed-in';
    fakeApi({ 'GET /me/reviews/fender-set': () => ({ canReview: true, reason: null, review: null }) });
    call(useMyReview, 'fender-set');
    expect(await fetchQuery(query('me', 'review', 'fender-set'))).toMatchObject({ canReview: true });
  });

  it('reads a product’s reviews', async () => {
    fakeApi({
      'GET /products/fender-set/reviews': () => ({
        average: 5,
        count: 1,
        distribution: [1, 0, 0, 0, 0],
        items: [review],
      }),
    });
    call(useProductReviews, 'fender-set');
    expect(await fetchQuery(query('reviews', 'fender-set'))).toMatchObject({ count: 1 });
  });

  it('refreshes the product’s reviews and the shopper’s own after saving or removing one', async () => {
    const sent = fakeApi({
      'PUT /me/reviews/fender-set': () => review,
      'DELETE /me/reviews/fender-set': () => undefined,
    });
    const invalidate = vi.spyOn(hooks.client, 'invalidateQueries');
    const { save, remove } = call(useSaveReview, 'fender-set');
    await save.mutateAsync({ rating: 5, title: 'Good', body: 'Rides well.' });
    await remove.mutateAsync();
    expect(sent.map((s) => `${s.method} ${s.auth}`)).toEqual(['PUT Bearer t', 'DELETE Bearer t']);
    expect(invalidate.mock.calls.map(([f]) => f!.queryKey)).toEqual([
      ['reviews', 'fender-set'],
      ['me', 'review', 'fender-set'],
      ['reviews', 'fender-set'],
      ['me', 'review', 'fender-set'],
    ]);
  });
});
