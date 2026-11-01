import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ refreshing: [] as boolean[] }));
vi.mock('react', async (actual) => ({
  ...(await actual<typeof import('react')>()),
  useState: (initial: boolean) => [initial, (next: boolean) => state.refreshing.push(next)],
  useCallback: (fn: unknown) => fn,
}));

const { usePullRefresh: pullRefresh } = await import('./use-pull-refresh');

beforeEach(() => {
  state.refreshing = [];
});

describe('usePullRefresh', () => {
  it('spins only for the shopper’s own pull, until the read settles', async () => {
    let done!: () => void;
    const { refreshing, onRefresh } = pullRefresh(() => new Promise<void>((r) => (done = r)));
    expect(refreshing).toBe(false);
    onRefresh();
    expect(state.refreshing).toEqual([true]);
    done();
    await vi.waitFor(() => expect(state.refreshing).toEqual([true, false]));
  });

  it('stops spinning when the read fails, without an unhandled rejection', async () => {
    pullRefresh(() => Promise.reject(new Error('offline'))).onRefresh();
    await vi.waitFor(() => expect(state.refreshing).toEqual([true, false]));
  });
});
