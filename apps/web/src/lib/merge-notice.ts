import type { Cart, MergeCartResult } from '@gear-store/shared';
import { useSyncExternalStore } from 'react';

// how many guest parts the merges into that account's cart could not fit, until the shopper dismisses it
let notice: { userId: string; count: number } | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const snapshot = () => notice;

export const mergeNotice = {
  count: (userId: string | null | undefined) => (notice && notice.userId === userId ? notice.count : 0),
  dismiss() {
    notice = null;
    notify();
  },
};

/** The account's cart from a merge reply, keeping what did not fit for the cart to tell the shopper. */
export function takeMergeReply(userId: string, reply: MergeCartResult): Cart {
  const { notMerged, ...cart } = reply;
  const left = notMerged.reduce((sum, l) => sum + l.quantity, 0);
  if (left > 0) {
    // a cut-off merge and the one after it both report: the shopper hears the total
    notice = { userId, count: mergeNotice.count(userId) + left };
    notify();
  }
  return cart;
}

/** mergeNotice.count, re-rendering when it changes */
export function useMergeNotice(userId: string | null | undefined): number {
  useSyncExternalStore(subscribe, snapshot);
  return mergeNotice.count(userId);
}
