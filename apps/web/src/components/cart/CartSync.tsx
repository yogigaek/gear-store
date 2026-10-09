import { cartSchema } from '@gear-store/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';
import { guestCart } from '../../lib/guest-cart';

/** On sign-in, whatever the guest put in the cart moves into the account's cart, then the local copy is cleared. */
export function CartSync() {
  const { status, authed } = useAuth();
  const queryClient = useQueryClient();
  const merging = useRef(false);

  useEffect(() => {
    if (status !== 'signed-in' || merging.current) return;
    const items = guestCart.lines();
    if (items.length === 0) return;
    merging.current = true;
    authed((accessToken) =>
      api('/me/cart/merge', { method: 'POST', body: { items }, accessToken, schema: cartSchema }),
    )
      .then((cart) => {
        guestCart.clear();
        queryClient.setQueryData(['me', 'cart'], cart);
      })
      // a failed merge keeps the local cart, so nothing is lost; it is retried on the next sign-in
      .catch(() => undefined)
      .finally(() => {
        merging.current = false;
      });
  }, [status, authed, queryClient]);

  return null;
}
