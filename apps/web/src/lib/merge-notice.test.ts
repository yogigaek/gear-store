import { mergeCartResultSchema } from '@gear-store/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { mergeNotice, takeMergeReply } from './merge-notice';

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
