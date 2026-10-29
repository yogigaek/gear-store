/**
 * The idempotency key of a checkout attempt, one per scope (the cart, or one Buy-now line), kept in this tab's
 * sessionStorage while the attempt is unanswered. A reload after no reply then resends the same key, and the API
 * answers it with the order it may already have made instead of a second one. The key is let go once the attempt
 * is settled: an order came back, the API refused it, or the shopper looked at their orders and so knows.
 */
const PREFIX = 'rakit:checkout-key:';
/** a retry after no reply comes within minutes; a key older than this belongs to an attempt long given up */
export const CHECKOUT_KEY_TTL_MS = 15 * 60 * 1000;

interface Record {
  key: string;
  at: number;
}
// where storage is refused (blocked site data, some private modes) the keys still last as long as the page
const memory = new Map<string, Record>();

function read(scope: string): Record | null {
  try {
    const raw = JSON.parse(sessionStorage.getItem(PREFIX + scope) ?? 'null') as Partial<Record> | null;
    if (typeof raw?.key === 'string' && typeof raw.at === 'number') return { key: raw.key, at: raw.at };
    return null;
  } catch {
    return memory.get(scope) ?? null;
  }
}

function kept(scope: string, now: number): string | null {
  const record = read(scope);
  return record && now - record.at < CHECKOUT_KEY_TTL_MS ? record.key : null;
}

/** the scope's open key, or a new one, kept until closed or for CHECKOUT_KEY_TTL_MS */
export function checkoutKey(scope: string, now = Date.now()): string {
  const open = kept(scope, now);
  if (open) return open;
  const record = { key: crypto.randomUUID(), at: now };
  try {
    sessionStorage.setItem(PREFIX + scope, JSON.stringify(record));
  } catch {
    memory.set(scope, record);
  }
  return record.key;
}

/** whether an attempt in this scope is still open: it may have made an order no reply announced */
export function hasOpenCheckoutKey(scope: string, now = Date.now()): boolean {
  return kept(scope, now) !== null;
}

/** the cart's scope: what it holds, so a cart filled with something else is a new order */
export function cartScope(
  lines: { slug: string; colorKey: string; quantity: number }[],
  builds: { id: string; quantity: number }[],
): string {
  const parts = lines.map((l) => `${l.slug}:${l.colorKey}:${l.quantity}`).sort();
  const bikes = builds.map((b) => `${b.id}:${b.quantity}`).sort();
  return `cart:${[...parts, ...bikes].join(',')}`;
}

function openScopes(): string[] {
  const scopes = [...memory.keys()];
  try {
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const name = sessionStorage.key(i);
      if (name?.startsWith(PREFIX)) scopes.push(name.slice(PREFIX.length));
    }
  } catch {
    // refused: the in-memory keys are all there is
  }
  return scopes;
}

/** whether any cart attempt is still open: the cart it ordered may already have been emptied into an order */
export function hasOpenCartAttempt(now = Date.now()): boolean {
  return openScopes().some((scope) => scope.startsWith('cart:') && kept(scope, now) !== null);
}

/** ends the scope's attempt: an order came back, or the API refused it (nothing was made) */
export function closeCheckoutKey(scope: string): void {
  memory.delete(scope);
  try {
    sessionStorage.removeItem(PREFIX + scope);
  } catch {
    // nothing kept there
  }
}

/** the shopper has seen their orders: any order an unanswered attempt made is known, so the next one is new */
export function closeAllCheckoutKeys(): void {
  for (const scope of openScopes()) closeCheckoutKey(scope);
}
