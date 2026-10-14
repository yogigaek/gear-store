import {
  cartSchema,
  MAX_CART_BUILDS,
  MAX_LINE_QUANTITY,
  type BuildSelection,
  type Cart,
} from '@gear-store/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { useAuth } from './auth-context';
import { guestCart, useGuestCart } from './guest-cart';

const SERVER_KEY = ['me', 'cart'];
const EMPTY: Cart = { items: [], builds: [], subtotal: 0, itemCount: 0, canCheckout: false };

/** One cart API for the page, whether it lives in this browser (guest) or on the server (signed in). */
export function useCart() {
  const { status, authed } = useAuth();
  const queryClient = useQueryClient();
  const signedIn = status === 'signed-in';
  const held = useGuestCart();
  const guestHasAny = held.items.length + held.builds.length > 0;

  const server = useQuery({
    queryKey: SERVER_KEY,
    queryFn: ({ signal }) =>
      authed((accessToken) => api('/me/cart', { accessToken, schema: cartSchema, signal })),
    enabled: signedIn,
  });
  const guest = useQuery({
    queryKey: ['cart', 'guest', held],
    queryFn: ({ signal }) => api('/cart/quote', { method: 'POST', body: held, schema: cartSchema, signal }),
    enabled: status === 'signed-out' && guestHasAny,
    placeholderData: (previous) => previous,
  });

  const onServerCart = (cart: Cart) => queryClient.setQueryData(SERVER_KEY, cart);
  const setServerLine = useMutation({
    mutationFn: (line: { slug: string; colorKey: string; quantity: number }) =>
      authed((accessToken) =>
        api('/me/cart/items', { method: 'PUT', body: line, accessToken, schema: cartSchema }),
      ),
    onSuccess: onServerCart,
  });
  const addServerBuild = useMutation({
    mutationFn: (build: BuildSelection & { quantity: number }) =>
      authed((accessToken) =>
        api('/me/cart/builds', { method: 'POST', body: build, accessToken, schema: cartSchema }),
      ),
    onSuccess: onServerCart,
  });
  const setServerBuild = useMutation({
    mutationFn: ({ id, quantity }: { id: string; quantity: number }) =>
      authed((accessToken) =>
        api(`/me/cart/builds/${id}`, { method: 'PUT', body: { quantity }, accessToken, schema: cartSchema }),
      ),
    onSuccess: onServerCart,
  });

  const cart = signedIn ? server.data : guestHasAny ? guest.data : EMPTY;

  const setQuantity = (slug: string, colorKey: string, quantity: number): Promise<void> => {
    if (signedIn) return setServerLine.mutateAsync({ slug, colorKey, quantity }).then(() => undefined);
    guestCart.set(slug, colorKey, quantity);
    return Promise.resolve();
  };

  return {
    cart,
    isLoading: status === 'restoring' || (signedIn ? server.isPending : guestHasAny && guest.isPending),
    isUpdating:
      setServerLine.isPending || addServerBuild.isPending || setServerBuild.isPending || guest.isFetching,
    error:
      (signedIn ? server.error : guest.error) ??
      setServerLine.error ??
      addServerBuild.error ??
      setServerBuild.error,
    setQuantity,
    /** adds to whatever is already in the cart for that part and finish */
    add: (slug: string, colorKey: string, quantity: number) => {
      const current =
        cart?.items.find((i) => i.product.slug === slug && i.colorKey === colorKey)?.quantity ?? 0;
      return setQuantity(slug, colorKey, Math.min(MAX_LINE_QUANTITY, current + quantity));
    },
    /** adds a bike; the server refuses one that cannot be built, with the reason */
    addBuild: async (selection: BuildSelection, quantity: number): Promise<void> => {
      if (signedIn) {
        await addServerBuild.mutateAsync({ ...selection, quantity });
        return;
      }
      if (!guestCart.addBuild(selection, quantity))
        throw new Error(`A cart holds up to ${MAX_CART_BUILDS} different bikes`);
    },
    setBuildQuantity: (id: string, quantity: number): Promise<void> => {
      if (signedIn) return setServerBuild.mutateAsync({ id, quantity }).then(() => undefined);
      guestCart.setBuild(id, quantity);
      return Promise.resolve();
    },
  };
}
