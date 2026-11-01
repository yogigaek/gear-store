import { describe, expect, it, vi } from 'vitest';
import { ApiError, retryTransient } from './api';

const queries = vi.hoisted(() => [] as Record<string, any>[]);
vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: Record<string, any>) => queries.push(options),
}));

const { useCategories: categories } = await import('./catalog');

describe('useCategories', () => {
  it('reads the part types, kept for ten minutes, retrying only what may pass', async () => {
    categories();
    const [q] = queries;
    expect(q).toMatchObject({ queryKey: ['categories'], staleTime: 600_000, retry: retryTransient });
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify([{ slug: 'frames', name: 'Frames', description: '', slot: 0, productCount: 3 }]),
        {
          status: 200,
        },
      )) as typeof fetch;
    expect(await q!.queryFn()).toHaveLength(1);
    globalThis.fetch = (async () => new Response('[{"slug":"Bad Slug"}]', { status: 200 })) as typeof fetch;
    await expect(q!.queryFn()).rejects.toBeInstanceOf(ApiError);
  });
});
