// The idempotency key of the order being placed, for one account. It outlives the checkout screen: leaving it
// while an order is on its way and coming back sends the same key again, which returns that order instead of
// placing a second one. A new key starts once an order came back, a definite refusal said nothing was placed,
// or another account checks out.
let current: { userId: string; key: string } | null = null;

/** the key for `userId`'s next attempt: the one still open for that account, else a new one from `create` */
export function checkoutKey(userId: string, create: () => string): string {
  if (current?.userId !== userId) current = { userId, key: create() };
  return current.key;
}

/** whether an attempt by `userId` ended without a clear answer, so its order may exist */
export function hasOpenCheckout(userId: string): boolean {
  return current?.userId === userId;
}

/** the attempt under `key` is over (an order came back, or nothing was placed): the next one is a new order */
export function closeCheckout(key: string): void {
  if (current?.key === key) current = null;
}
