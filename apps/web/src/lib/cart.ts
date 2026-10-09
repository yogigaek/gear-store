import { cartSchema, type Cart, MAX_LINE_QUANTITY } from '@gear-store/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { useAuth } from './auth-context';
import { guestCart, useGuestCartLines } from './guest-cart';

const SERVER_KEY = ['me', 'cart'];

/** One cart API for the page, whether it lives in this browser (guest) or on the server (signed in). */
export function useCart() {
  const { status, authed } = useAuth();
  const queryClient = useQueryClient();
  const signedIn = status === 'signed-in';
  const guestLines = useGuestCartLines();

  const server = useQuery({
    queryKey: SERVER_KEY,
    queryFn: ({ signal }) =>
      authed((accessToken) => api('/me/cart', { accessToken, schema: cartSchema, signal })),
    enabled: signedIn,
  });
  const guest = useQuery({
    queryKey: ['cart', 'guest', guestLines],
    queryFn: ({ signal }) =>
      api('/cart/quote', { method: 'POST', body: { items: guestLines }, schema: cartSchema, signal }),
    enabled: status === 'signed-out' && guestLines.length > 0,
    placeholderData: (previous) => previous,
  });

  const setServerLine = useMutation({
    mutationFn: (line: { slug: string; colorKey: string; quantity: number }) =>
      authed((accessToken) =>
        api('/me/cart/items', { method: 'PUT', body: line, accessToken, schema: cartSchema }),
      ),
    onSuccess: (cart) => queryClient.setQueryData(SERVER_KEY, cart),
  });

  const empty: Cart = { items: [], subtotal: 0, itemCount: 0, canCheckout: false };
  const cart = signedIn ? server.data : guestLines.length ? guest.data : empty;

  const setQuantity = (slug: string, colorKey: string, quantity: number): Promise<void> => {
    if (signedIn) return setServerLine.mutateAsync({ slug, colorKey, quantity }).then(() => undefined);
    guestCart.set(slug, colorKey, quantity);
    return Promise.resolve();
  };

  return {
    cart,
    isLoading:
      status === 'restoring' || (signedIn ? server.isPending : guestLines.length > 0 && guest.isPending),
    isUpdating: setServerLine.isPending || guest.isFetching,
    error: (signedIn ? server.error : guest.error) ?? setServerLine.error,
    setQuantity,
    /** adds to whatever is already in the cart for that product and finish */
    add: (slug: string, colorKey: string, quantity: number) => {
      const current =
        cart?.items.find((i) => i.product.slug === slug && i.colorKey === colorKey)?.quantity ?? 0;
      return setQuantity(slug, colorKey, Math.min(MAX_LINE_QUANTITY, current + quantity));
    },
  };
}
