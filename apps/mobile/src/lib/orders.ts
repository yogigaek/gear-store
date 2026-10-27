import {
  addressSchema,
  orderDetailSchema,
  orderSummarySchema,
  type AddressInput,
  type OrderDetail,
  type OrderStatus,
} from '@gear-store/shared';
import { useQuery, type QueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { ApiError } from './api';
import { authedApi, useAuth } from './auth';

export const statusLabels: Record<OrderStatus, string> = {
  PENDING_PAYMENT: 'Waiting for payment',
  PAID: 'Paid',
  SHIPPED: 'Shipped',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
};

export const addressesKey = (userId: string) => ['me', userId, 'addresses'] as const;
export const ordersKey = (userId: string) => ['me', userId, 'orders'] as const;
export const orderKey = (userId: string, number: string) => ['me', userId, 'order', number] as const;

const addressListSchema = z.array(addressSchema);
const orderListSchema = z.array(orderSummarySchema);
const paymentPageSchema = z.object({ redirectUrl: z.url() });

/** an unknown or malformed order number will not turn up by asking again; anything else may */
const retryTransient = (count: number, error: Error) =>
  !(error instanceof ApiError && (error.status === 404 || error.status === 400)) && count < 3;

function useUserId() {
  const state = useAuth();
  return state.status === 'signed-in' ? state.user.id : '';
}

/** the signed-in account's saved addresses, default first, each with its shipping fee */
export function useAddresses() {
  const userId = useUserId();
  return useQuery({
    queryKey: addressesKey(userId),
    queryFn: () => authedApi('/me/addresses', addressListSchema),
    enabled: userId !== '',
  });
}

/** the account's recent orders, newest first */
export function useOrders() {
  const userId = useUserId();
  return useQuery({
    queryKey: ordersKey(userId),
    queryFn: () => authedApi('/me/orders', orderListSchema),
    enabled: userId !== '',
    retry: retryTransient,
  });
}

/**
 * One order. Once a payment page has been opened for it, it is re-read every few seconds, as the web's order page
 * does, so a payment the API learns of shows up without a tap.
 */
export function useOrder(number: string) {
  const userId = useUserId();
  return useQuery({
    queryKey: orderKey(userId, number),
    queryFn: () => orders.get(number),
    enabled: userId !== '',
    retry: retryTransient,
    refetchInterval: (query) => (query.state.data?.canPay && query.state.data.payment ? 8_000 : false),
  });
}

// the address just saved on the form, for checkout to select when it comes back into view (as the web does)
let lastAdded: string | null = null;

export const orders = {
  async createAddress(input: AddressInput) {
    const address = await authedApi('/me/addresses', addressSchema, { method: 'POST', body: input });
    lastAdded = address.id;
    return address;
  },
  /** the id of the address saved since the last call, once */
  takeAddedAddress() {
    const id = lastAdded;
    lastAdded = null;
    return id;
  },
  get: (number: string) => authedApi(`/me/orders/${encodeURIComponent(number)}`, orderDetailSchema),
  /** places the account's cart as an order; the same key again returns the same order instead of a second one */
  place: (addressId: string, idempotencyKey: string) =>
    authedApi('/me/orders', orderDetailSchema, { method: 'POST', body: { addressId, idempotencyKey } }),
  /** the Midtrans page for an order waiting for payment */
  paymentPage: (number: string) =>
    authedApi(`/me/orders/${encodeURIComponent(number)}/pay`, paymentPageSchema, { method: 'POST' }),
  /** asks Midtrans for the latest status: the API on a laptop cannot receive its webhook, so the app pulls it */
  pullPayment: (number: string) =>
    authedApi(`/me/orders/${encodeURIComponent(number)}/payment-status`, orderDetailSchema, {
      method: 'POST',
    }),
  cancel: (number: string) =>
    authedApi(`/me/orders/${encodeURIComponent(number)}/cancel`, orderDetailSchema, { method: 'POST' }),
};

export function showOrder(queryClient: QueryClient, userId: string, order: OrderDetail) {
  queryClient.setQueryData(orderKey(userId, order.number), order);
  void queryClient.invalidateQueries({ queryKey: ordersKey(userId) });
}

/** "27 Oct 2026, 14:05" in Jakarta time, as the store runs on WIB */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    timeZone: 'Asia/Jakarta',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
