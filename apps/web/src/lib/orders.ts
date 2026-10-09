import {
  addressSchema,
  orderDetailSchema,
  orderSummarySchema,
  type AddressInput,
  type OrderDetail,
} from '@gear-store/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { api } from './api';
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

export function useOrders() {
  const { status, authed } = useAuth();
  return useQuery({
    queryKey: ORDERS,
    queryFn: ({ signal }) =>
      authed((accessToken) =>
        api('/me/orders', { accessToken, schema: z.array(orderSummarySchema), signal }),
      ),
    enabled: status === 'signed-in',
  });
}

export function useOrder(number: string) {
  const { status, authed } = useAuth();
  return useQuery({
    queryKey: [...ORDERS, number],
    queryFn: ({ signal }) =>
      authed((accessToken) =>
        api(`/me/orders/${encodeURIComponent(number)}`, { accessToken, schema: orderDetailSchema, signal }),
      ),
    enabled: status === 'signed-in',
  });
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
  return {
    pay: useMutation({
      mutationFn: () =>
        authed((accessToken) =>
          api(`${path}/pay`, { method: 'POST', accessToken, schema: z.object({ redirectUrl: z.url() }) }),
        ),
      // the payment page is Midtrans' own site; it sends the buyer back to this order afterwards
      onSuccess: ({ redirectUrl }) => window.location.assign(redirectUrl),
    }),
    checkStatus: useMutation({
      mutationFn: () =>
        authed((accessToken) =>
          api(`${path}/payment-status`, { method: 'POST', accessToken, schema: orderDetailSchema }),
        ),
      onSuccess: store,
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

export function useCheckout() {
  const { authed } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { addressId: string; idempotencyKey: string }) =>
      authed((accessToken) =>
        api('/me/orders', { method: 'POST', body: input, accessToken, schema: orderDetailSchema }),
      ),
    onSuccess: (order) => {
      queryClient.setQueryData([...ORDERS, order.number], order);
      // the cart is empty now, and stock counts on product pages have changed
      void queryClient.invalidateQueries({ queryKey: ['me', 'cart'] });
      void queryClient.invalidateQueries({ queryKey: ORDERS, exact: true });
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      void queryClient.invalidateQueries({ queryKey: ['product'] });
    },
  });
}
