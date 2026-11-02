/**
 * A tab left open across a deploy asks for page chunks under the old build's file names, which are gone. A reload
 * fetches the new build. A stamp in sessionStorage keeps a chunk that is really missing from reloading forever.
 */
const KEY = 'rakit:chunk-reload';
/** a reload that did not help fails again within seconds; a failure long after it is another deploy */
export const RELOAD_GUARD_MS = 60_000;

// what each engine says when import() cannot load a module: Chromium, Firefox, Safari
const MESSAGES = [
  'Failed to fetch dynamically imported module',
  'error loading dynamically imported module',
  'Importing a module script failed',
];

/** whether a route failed because one of its page chunks could not be loaded */
export function isStaleChunkError(error: unknown): boolean {
  return error instanceof Error && MESSAGES.some((m) => error.message.includes(m));
}

/** whether to reload the page for this route error: a stale chunk, at most once per RELOAD_GUARD_MS */
export function shouldReloadForStaleChunk(error: unknown, now = Date.now()): boolean {
  if (!isStaleChunkError(error)) return false;
  try {
    if (now - Number(sessionStorage.getItem(KEY)) < RELOAD_GUARD_MS) return false;
    sessionStorage.setItem(KEY, String(now));
    return true;
  } catch {
    // without the stamp nothing would stop a loop: the error page and its retry button instead
    return false;
  }
}
