import { cartSchema } from '@gear-store/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';
import { guestCart } from '../../lib/guest-cart';

/**
 * On sign-in, whatever the guest put in the cart moves into the account's cart (see guestCart.beginMerge):
 * a merge that was cut off is sent again under its key, which the API recognises, and the local copy only
 * goes once the API confirms. A failure keeps everything for the next try.
 */
export function CartSync() {
  const { status, authed } = useAuth();
  const queryClient = useQueryClient();
  const merging = useRef(false);

  useEffect(() => {
    if (status !== 'signed-in' || merging.current) return;
    merging.current = true;
    const run = async () => {
      // the merge left over from a cut-off attempt first, then anything added since
      for (let job = guestCart.beginMerge(); job; job = guestCart.beginMerge()) {
        const body = { ...job.cart, mergeKey: job.key };
        try {
          const cart = await authed((accessToken) =>
            api('/me/cart/merge', { method: 'POST', body, accessToken, schema: cartSchema }),
          );
          guestCart.finishMerge(job);
          queryClient.setQueryData(['me', 'cart'], cart);
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
  }, [status, authed, queryClient]);

  return null;
}
