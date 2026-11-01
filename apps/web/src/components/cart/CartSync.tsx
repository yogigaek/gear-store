import { mergeCartResultSchema } from '@gear-store/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';
import { guestCart } from '../../lib/guest-cart';
import { takeMergeReply } from '../../lib/merge-notice';

/**
 * On sign-in, whatever the guest put in the cart moves into the account's cart (see guestCart.beginMerge):
 * a merge that was cut off is sent again under its key, which the API recognises, and the local copy only
 * goes once the API confirms. A failure keeps everything for the next try.
 */
export function CartSync() {
  const { status, user, authed } = useAuth();
  const queryClient = useQueryClient();
  const merging = useRef(false);

  useEffect(() => {
    const userId = user?.id;
    if (status !== 'signed-in' || !userId || merging.current) return;
    merging.current = true;
    const run = async () => {
      // the merge left over from a cut-off attempt first, then anything added since
      for (let job = guestCart.beginMerge(); job; job = guestCart.beginMerge()) {
        const body = { ...job.cart, mergeKey: job.key };
        try {
          const reply = await authed((accessToken) =>
            api('/me/cart/merge', { method: 'POST', body, accessToken, schema: mergeCartResultSchema }),
          );
          guestCart.finishMerge(job);
          queryClient.setQueryData(['me', 'cart'], takeMergeReply(userId, reply));
        } catch (error) {
          // refused as invalid: nothing was added, so drop this attempt and let the cart start a fresh one
          if (error instanceof ApiError && error.status === 400) guestCart.abandonMerge(job);
          throw error;
        }
      }
    };
    run()
      .catch(() => undefined)
      .finally(() => {
        merging.current = false;
      });
  }, [status, user?.id, authed, queryClient]);

  return null;
}
