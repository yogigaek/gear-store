import {
  addressSchema,
  orderDetailSchema,
  orderSummarySchema,
  type AddressInput,
  type CheckoutInput,
  type OrderDetail,
} from '@gear-store/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { z } from 'zod';
import { api, ApiError } from './api';
import { useAuth } from './auth-context';

const ADDRESSES = ['me', 'addresses'];
const ORDERS = ['me', 'orders'];

export function useAddresses() {
  const { status, authed } = useAuth();
  return useQuery({
    queryKey: ADDRESSES,
    queryFn: ({ signal }) =>
      authed((accessToken) => api('/me/addresses', { accessToken, schema: z.array(addressSchema), signal })),
    enabled: status === 'signed-in',
  });
}

export function useSaveAddress() {
  const { authed } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: AddressInput }) =>
      authed((accessToken) =>
        api(id ? `/me/addresses/${id}` : '/me/addresses', {
          method: id ? 'PUT' : 'POST',
          body: input,
          accessToken,
          schema: addressSchema,
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ADDRESSES }),
  });
}

export function useDeleteAddress() {
  const { authed } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      authed((accessToken) => api(`/me/addresses/${id}`, { method: 'DELETE', accessToken })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ADDRESSES }),
  });
}

export function useOrders({ enabled = true }: { enabled?: boolean } = {}) {
  const { status, authed } = useAuth();
  return useQuery({
    queryKey: ORDERS,
    queryFn: ({ signal }) =>
      authed((accessToken) =>
        api('/me/orders', { accessToken, schema: z.array(orderSummarySchema), signal }),
      ),
    enabled: enabled && status === 'signed-in',
  });
}

/**
 * One order. With `watchPayment`, an order whose payment page has been opened is read again every few seconds
 * while the tab is visible, so a payment confirmed by Midtrans' webhook shows without a reload. Reading the
 * order is cheap: it does not ask Midtrans.
 */
export function useOrder(number: string, { watchPayment = false }: { watchPayment?: boolean } = {}) {
  const { status, authed } = useAuth();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: [...ORDERS, number],
    queryFn: ({ signal }) =>
      authed((accessToken) =>
        api(`/me/orders/${encodeURIComponent(number)}`, { accessToken, schema: orderDetailSchema, signal }),
      ),
    enabled: status === 'signed-in',
    refetchInterval: (q) => (watchPayment && q.state.data?.canPay && q.state.data.payment ? 8000 : false),
    refetchIntervalInBackground: false,
  });
  // the order moved on (paid, expired) while on screen: the list of orders shows it too
  const orderStatus = query.data?.status;
  const seen = useRef(orderStatus);
  useEffect(() => {
    if (seen.current && orderStatus && seen.current !== orderStatus)
      void queryClient.invalidateQueries({ queryKey: ORDERS, exact: true });
    seen.current = orderStatus;
  }, [orderStatus, queryClient]);
  return query;
}

/** Actions on one order; each one stores the order the API sends back. */
export function useOrderActions(number: string) {
  const { authed } = useAuth();
  const queryClient = useQueryClient();
  const store = (order: OrderDetail) => {
    queryClient.setQueryData([...ORDERS, number], order);
    void queryClient.invalidateQueries({ queryKey: ORDERS, exact: true });
  };
  const path = `/me/orders/${encodeURIComponent(number)}`;
  const askStatus = () =>
    authed((accessToken) =>
      api(`${path}/payment-status`, { method: 'POST', accessToken, schema: orderDetailSchema }),
    );
  return {
    pay: useMutation({
      mutationFn: () =>
        authed((accessToken) =>
          api(`${path}/pay`, { method: 'POST', accessToken, schema: z.object({ redirectUrl: z.url() }) }),
        ),
      // the payment page is Midtrans' own site; it sends the buyer back to this order afterwards
      onSuccess: ({ redirectUrl }) => window.location.assign(redirectUrl),
    }),
    checkStatus: useMutation({ mutationFn: askStatus, onSuccess: store }),
    /**
     * The same check, made in the background: its failures are not the buyer's to see, and it only updates
     * the order (useOrder refreshes the list when the status actually changes).
     */
    pullStatus: useMutation({
      mutationFn: askStatus,
      onSuccess: (order: OrderDetail) => queryClient.setQueryData([...ORDERS, number], order),
    }),
    cancel: useMutation({
      mutationFn: () =>
        authed((accessToken) =>
          api(`${path}/cancel`, { method: 'POST', accessToken, schema: orderDetailSchema }),
        ),
      onSuccess: store,
    }),
  };
}

/** Places an order: the whole cart, or with `items` (Buy now) only those parts, leaving the cart as it is. */
export function useCheckout() {
  const { authed } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CheckoutInput) =>
      authed((accessToken) =>
        api('/me/orders', { method: 'POST', body: input, accessToken, schema: orderDetailSchema }),
      ),
    onSuccess: (order, input) => {
      queryClient.setQueryData([...ORDERS, order.number], order);
      // the cart is empty now (unless this was a Buy now), and stock counts on product pages have changed
      if (!input.items) void queryClient.invalidateQueries({ queryKey: ['me', 'cart'] });
      void queryClient.invalidateQueries({ queryKey: ORDERS, exact: true });
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      void queryClient.invalidateQueries({ queryKey: ['product'] });
      void queryClient.invalidateQueries({ queryKey: ['cart', 'lines'] });
    },
    // a refused checkout may have changed the cart (a part no longer sold is taken out), or Buy now's price and stock
    onError: (error, input) => {
      // a lost reply may hide an order that went through: re-reading now would count its held stock against the retry
      if (error instanceof ApiError && error.status === 0) {
        // but the order list must be read again before it can be trusted to show (or not) that order
        void queryClient.invalidateQueries({ queryKey: ORDERS, exact: true });
        return;
      }
      void queryClient.invalidateQueries({ queryKey: input.items ? ['cart', 'lines'] : ['me', 'cart'] });
    },
  });
}
