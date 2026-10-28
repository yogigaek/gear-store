import type { CartLineInput } from '@gear-store/shared';

// The idempotency key of the order being placed, for one account and one kind of checkout. It outlives the checkout
// screen: leaving it while an order is on its way and coming back sends the same key again, which returns that
// order instead of placing a second one. A new key starts once an order came back, a definite refusal said nothing
// was placed, or another account checks out. The API returns the same order for the same key whatever the body
// says, so keys are kept per scope (the cart, or one Buy-now line): a Buy-now key sent for the cart, or for another
// part, would bring back the wrong order.
let current: { userId: string; keys: Map<string, string> } | null = null;

/** what a key belongs to: the whole cart, or exactly this part, finish and quantity bought on its own */
export function checkoutScope(line?: CartLineInput | null): string {
  return line ? `buy:${line.slug}:${line.colorKey}:${line.quantity}` : 'cart';
}

/** the key for `userId`'s next attempt in `scope`: the one still open there, else a new one from `create` */
export function checkoutKey(userId: string, scope: string, create: () => string): string {
  if (current?.userId !== userId) current = { userId, keys: new Map() };
  let key = current.keys.get(scope);
  if (!key) {
    key = create();
    current.keys.set(scope, key);
  }
  return key;
}

/** whether an attempt by `userId` in `scope` ended without a clear answer, so its order may exist */
export function hasOpenCheckout(userId: string, scope: string): boolean {
  return current?.userId === userId && current.keys.has(scope);
}

/** the attempt under `key` is over (an order came back, or nothing was placed): the next one is a new order */
export function closeCheckout(key: string): void {
  if (!current) return;
  for (const [scope, open] of current.keys) if (open === key) current.keys.delete(scope);
}
