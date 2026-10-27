import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useAuth } from '../lib/auth';
import { mergeInto } from '../lib/cart';

/**
 * On sign-in, whatever was put in the cart on this phone moves into the account's cart (see mergeInto); a failure
 * keeps everything for the next sign-in or launch. On sign-out, every account's data leaves the screen.
 */
export function CartSync() {
  const state = useAuth();
  const userId = state.status === 'signed-in' ? state.user.id : null;
  const queryClient = useQueryClient();

  useEffect(() => {
    if (state.status === 'signed-out') queryClient.removeQueries({ queryKey: ['me'] });
    if (userId) void mergeInto(queryClient, userId).catch(() => undefined);
  }, [state.status, userId, queryClient]);

  return null;
}
