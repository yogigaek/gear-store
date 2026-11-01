import { mergeCartResultSchema } from '@gear-store/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mergeNotice, takeMergeReply, useMergeNotice } from './merge-notice';

const external = vi.hoisted(() => ({ subscribe: null as ((notify: () => void) => () => void) | null }));
vi.mock('react', async (actual) => ({
  ...(await actual<typeof import('react')>()),
  useSyncExternalStore: (subscribe: (n: () => void) => () => void, read: () => unknown) => {
    external.subscribe = subscribe;
    return read();
  },
}));

const reply = (notMerged: object[]) =>
  mergeCartResultSchema.parse({
    items: [],
    builds: [],
    subtotal: 0,
    itemCount: 0,
    canCheckout: false,
    notMerged,
  });

describe('merge notice', () => {
  afterEach(() => mergeNotice.dismiss());

  it('counts the guest parts that did not fit, for that account only, and hands back the cart', () => {
    const cart = takeMergeReply(
      'ana',
      reply([
        { slug: 'workshop-hex-set', colorKey: '', quantity: 3 },
        { slug: 'fender-set', colorKey: '', quantity: 2 },
      ]),
    );
    expect(cart).not.toHaveProperty('notMerged');
    expect(mergeNotice.count('ana')).toBe(5);
    expect(mergeNotice.count('budi')).toBe(0);
  });

  it('says nothing when everything fitted, and goes once dismissed', () => {
    takeMergeReply('ana', reply([{ slug: 'fender-set', colorKey: '', quantity: 1 }]));
    takeMergeReply('ana', reply([]));
    expect(mergeNotice.count('ana')).toBe(1);
    mergeNotice.dismiss();
    expect(mergeNotice.count('ana')).toBe(0);
  });

  it('adds up what several merges for one account left out, and starts again for another account', () => {
    takeMergeReply('ana', reply([{ slug: 'fender-set', colorKey: '', quantity: 2 }]));
    takeMergeReply('ana', reply([{ slug: 'rear-rack', colorKey: '', quantity: 3 }]));
    expect(mergeNotice.count('ana')).toBe(5);
    takeMergeReply('budi', reply([{ slug: 'rear-rack', colorKey: '', quantity: 1 }]));
    expect(mergeNotice.count('budi')).toBe(1);
    expect(mergeNotice.count('ana')).toBe(0);
  });
});

describe('useMergeNotice', () => {
  afterEach(() => mergeNotice.dismiss());

  it('reads the count for the account shown, and none signed out', () => {
    takeMergeReply('ana', reply([{ slug: 'fender-set', colorKey: '', quantity: 2 }]));
    expect(useMergeNotice('ana')).toBe(2);
    expect(useMergeNotice(null)).toBe(0);
    expect(useMergeNotice(undefined)).toBe(0);
  });

  it('tells its readers when a merge leaves something out or the notice is dismissed, until they leave', () => {
    useMergeNotice('ana');
    const notify = vi.fn();
    const leave = external.subscribe!(notify);
    takeMergeReply('ana', reply([]));
    expect(notify).not.toHaveBeenCalled();
    takeMergeReply('ana', reply([{ slug: 'fender-set', colorKey: '', quantity: 1 }]));
    mergeNotice.dismiss();
    expect(notify).toHaveBeenCalledTimes(2);
    leave();
    takeMergeReply('ana', reply([{ slug: 'fender-set', colorKey: '', quantity: 1 }]));
    expect(notify).toHaveBeenCalledTimes(2);
  });
});
