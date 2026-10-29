/**
 * The idempotency key of a checkout attempt, one per scope (the cart, or one Buy-now line), kept in this tab's
 * sessionStorage until the attempt ends. A reload or a trip to the orders page after an unanswered attempt then
 * resends the same key, and the API answers it with the order it may already have made instead of a second one.
 */
const PREFIX = 'rakit:checkout-key:';
/** a retry after no reply comes within minutes; a key older than this belongs to an attempt long given up */
export const CHECKOUT_KEY_TTL_MS = 15 * 60 * 1000;

function kept(scope: string, now: number): string | null {
  try {
    const raw = JSON.parse(sessionStorage.getItem(PREFIX + scope) ?? 'null') as {
      key?: unknown;
      at?: unknown;
    };
    if (typeof raw?.key === 'string' && typeof raw.at === 'number' && now - raw.at < CHECKOUT_KEY_TTL_MS)
      return raw.key;
  } catch {
    // unreadable or refused (private mode, blocked): no open attempt
  }
  return null;
}

/** the scope's open key, or a new one, kept until closeCheckoutKey or for CHECKOUT_KEY_TTL_MS */
export function checkoutKey(scope: string, now = Date.now()): string {
  const open = kept(scope, now);
  if (open) return open;
  const key = crypto.randomUUID();
  try {
    sessionStorage.setItem(PREFIX + scope, JSON.stringify({ key, at: now }));
  } catch {
    // storage refused: a key for this attempt only
  }
  return key;
}

/** whether an attempt in this scope is still open: it may have made an order no reply announced */
export function hasOpenCheckoutKey(scope: string, now = Date.now()): boolean {
  return kept(scope, now) !== null;
}

/** the cart's scope: what it holds, so a cart filled again after an attempt is a new order, never the old one */
export function cartScope(
  lines: { slug: string; colorKey: string; quantity: number }[],
  builds: { id: string; quantity: number }[],
): string {
  const parts = lines.map((l) => `${l.slug}:${l.colorKey}:${l.quantity}`).toSorted();
  const bikes = builds.map((b) => `${b.id}:${b.quantity}`).toSorted();
  return `cart:${[...parts, ...bikes].join(',')}`;
}

/** whether any cart attempt is still open: the cart it ordered may already have been emptied into an order */
export function hasOpenCartAttempt(now = Date.now()): boolean {
  try {
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const name = sessionStorage.key(i);
      if (name?.startsWith(`${PREFIX}cart:`) && kept(name.slice(PREFIX.length), now)) return true;
    }
  } catch {
    // refused: nothing known
  }
  return false;
}

/** ends the scope's attempt: an order came back, or the API refused it (nothing was made) */
export function closeCheckoutKey(scope: string): void {
  try {
    sessionStorage.removeItem(PREFIX + scope);
  } catch {
    // nothing kept
  }
}
