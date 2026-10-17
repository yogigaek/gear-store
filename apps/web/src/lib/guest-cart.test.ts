import { afterEach, describe, expect, it } from 'vitest';
import { guestCart, subtract } from './guest-cart';

// node has no localStorage: give the module one for these tests
const store = new Map<string, string>();
globalThis.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  length: 0,
} as Storage;

const parts = {
  frames: 'e1-frame-m',
  batteries: 'e1-battery-625',
  shocks: 'e1-shock-air',
  forks: 'e1-fork-160',
  wheelsets: 'e1-wheelset-alloy',
  drivetrains: 'e1-drivetrain-12',
  cockpits: 'e1-cockpit-alloy',
  seats: 'e1-seat-150',
};

describe('guest cart merge', () => {
  afterEach(() => {
    guestCart.clear();
    store.clear();
  });

  it('offers a cut-off merge again, as sent and under the same key', () => {
    guestCart.set('fender-set', '', 1);
    const first = guestCart.beginMerge();
    guestCart.set('rear-rack', '', 1); // added while the reply was lost
    expect(guestCart.beginMerge()).toEqual(first);
  });

  it('keeps what was added since once the merge is confirmed, for a merge of its own', () => {
    guestCart.set('fender-set', '', 2);
    const first = guestCart.beginMerge()!;
    guestCart.set('fender-set', '', 3);
    guestCart.set('rear-rack', '', 1);
    guestCart.finishMerge(first);
    expect(guestCart.read().items).toEqual([
      { slug: 'fender-set', colorKey: '', quantity: 1 },
      { slug: 'rear-rack', colorKey: '', quantity: 1 },
    ]);
    const second = guestCart.beginMerge()!;
    expect(second.key).not.toBe(first.key);
    guestCart.finishMerge(second);
    expect(guestCart.beginMerge()).toBeNull();
  });

  it('never clears a merge another tab has started since', () => {
    guestCart.set('fender-set', '', 1);
    const first = guestCart.beginMerge()!;
    // another tab finished `first` and began the next merge
    store.set('rakit:cart:pending-merge', JSON.stringify({ key: crypto.randomUUID(), cart: first.cart }));
    const next = guestCart.beginMerge()!;
    guestCart.finishMerge(first); // this tab's late reply
    expect(guestCart.beginMerge()?.key).toBe(next.key);
  });

  it('knows a bike by its parts and colour, even when it was removed and added again', () => {
    const merged = { items: [], builds: [{ key: 'old', parts, colorKey: 'signal', quantity: 1 }] };
    const cart = { items: [], builds: [{ key: 'new', parts, colorKey: 'signal', quantity: 1 }] };
    expect(subtract(cart, merged).builds).toEqual([]);
  });

  it('takes bikes off by their key and quantity', () => {
    const cart = {
      items: [],
      builds: [
        { key: 'a', parts, colorKey: 'signal', quantity: 3 },
        { key: 'b', parts, colorKey: 'moss', quantity: 1 },
      ],
    };
    const merged = { items: [], builds: [{ key: 'a', parts, colorKey: 'signal', quantity: 1 }] };
    expect(subtract(cart, merged).builds).toEqual([
      { key: 'a', parts, colorKey: 'signal', quantity: 2 },
      { key: 'b', parts, colorKey: 'moss', quantity: 1 },
    ]);
  });
});
