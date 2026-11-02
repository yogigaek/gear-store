import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isStaleChunkError, RELOAD_GUARD_MS, shouldReloadForStaleChunk } from './stale-chunk';

const store = new Map<string, string>();
const storage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => store.set(k, v),
};
const refuse = () => {
  throw new Error('blocked');
};

const chromium = new TypeError(
  'Failed to fetch dynamically imported module: https://yogi-store.vercel.app/assets/CatalogPage-Bq1x.js',
);
const firefox = new TypeError(
  'error loading dynamically imported module: https://yogi-store.vercel.app/assets/CatalogPage-Bq1x.js',
);
const safari = new TypeError('Importing a module script failed.');

beforeEach(() => {
  store.clear();
  vi.stubGlobal('sessionStorage', storage);
});
afterEach(() => vi.unstubAllGlobals());

describe('isStaleChunkError', () => {
  it.each([
    ['Chromium', chromium],
    ['Firefox', firefox],
    ['Safari', safari],
  ])('knows a page chunk %s could not load', (_, error) => {
    expect(isStaleChunkError(error)).toBe(true);
  });

  it.each([
    ['an error in a page', new TypeError("Cannot read properties of undefined (reading 'name')")],
    ['an API failure', new Error('Failed to fetch')],
    ['a thrown string naming a chunk', 'Failed to fetch dynamically imported module'],
    ['a thrown reply', new Response(null, { status: 500 })],
    ['nothing', undefined],
  ])('leaves %s alone', (_, error) => {
    expect(isStaleChunkError(error)).toBe(false);
  });
});

describe('shouldReloadForStaleChunk', () => {
  const at = 1_000_000;

  it('reloads once for a stale chunk, then shows the error if the reload did not help', () => {
    expect(shouldReloadForStaleChunk(chromium, at)).toBe(true);
    expect(shouldReloadForStaleChunk(chromium, at + 2_000)).toBe(false);
    expect(shouldReloadForStaleChunk(safari, at + RELOAD_GUARD_MS - 1)).toBe(false);
  });

  it('reloads again for a later deploy, long after the last reload', () => {
    expect(shouldReloadForStaleChunk(firefox, at)).toBe(true);
    expect(shouldReloadForStaleChunk(firefox, at + RELOAD_GUARD_MS)).toBe(true);
  });

  it('never reloads for an error that is not a stale chunk, and leaves no stamp', () => {
    expect(shouldReloadForStaleChunk(new Error('boom'), at)).toBe(false);
    expect(store.size).toBe(0);
    expect(shouldReloadForStaleChunk(chromium, at)).toBe(true);
  });

  it('reloads over a stamp it cannot read', () => {
    store.set('rakit:chunk-reload', 'not a time');
    expect(shouldReloadForStaleChunk(chromium, at)).toBe(true);
    expect(shouldReloadForStaleChunk(chromium, at + 1)).toBe(false);
  });

  it.each([
    ['reading', { getItem: refuse, setItem: () => undefined }],
    ['writing', { getItem: () => null, setItem: refuse }],
  ])('does not reload when storage refuses %s: nothing would stop a loop', (_, refused) => {
    vi.stubGlobal('sessionStorage', refused);
    expect(shouldReloadForStaleChunk(chromium, at)).toBe(false);
  });

  it('does not reload where there is no storage at all', () => {
    vi.unstubAllGlobals();
    vi.stubGlobal('sessionStorage', undefined);
    expect(shouldReloadForStaleChunk(chromium, at)).toBe(false);
  });
});
