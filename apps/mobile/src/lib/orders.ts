import {
  addressSchema,
  orderDetailSchema,
  orderSummarySchema,
  type AddressInput,
  type CartLineInput,
  type OrderDetail,
  type OrderStatus,
} from '@gear-store/shared';
import { useQuery, type QueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { colors } from '../theme';
import { retryTransient } from './api';
import { authedApi, currentUserId, useAuth } from './auth';

export const statusLabels: Record<OrderStatus, string> = {
  PENDING_PAYMENT: 'Waiting for payment',
  PAID: 'Paid',
  SHIPPED: 'Shipped',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
};

/** as on the web: waiting asks something of the buyer (signal), paid onwards is good news, closed unpaid is muted */
export const statusColors: Record<OrderStatus, string> = {
  PENDING_PAYMENT: colors.signal,
  PAID: colors.ok,
  SHIPPED: colors.ok,
  DELIVERED: colors.ok,
  CANCELLED: colors.ink3,
  EXPIRED: colors.ink3,
};

export const addressesKey = (userId: string) => ['me', userId, 'addresses'] as const;
export const ordersKey = (userId: string) => ['me', userId, 'orders'] as const;
export const orderKey = (userId: string, number: string) => ['me', userId, 'order', number] as const;

const addressListSchema = z.array(addressSchema);
const orderListSchema = z.array(orderSummarySchema);
const paymentPageSchema = z.object({ redirectUrl: z.url() });

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
 * One order. Once a payment page has been opened for it, it is re-read every few seconds while `watching` (its
 * screen is in view), as the web's order page does, so a payment the API learns of shows up without a tap.
 */
export function useOrder(number: string, watching: boolean) {
  const userId = useUserId();
  return useQuery({
    queryKey: orderKey(userId, number),
    queryFn: () => orders.get(number),
    enabled: userId !== '',
    retry: retryTransient,
    refetchInterval: (query) =>
      watching && query.state.data?.canPay && query.state.data.payment ? 8_000 : false,
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
  /**
   * Places the account's cart as an order, or with `items` exactly those parts, leaving the cart as it is (Buy
   * now). The same key again returns the same order instead of a second one, whatever the body says.
   */
  place: (addressId: string, idempotencyKey: string, items?: CartLineInput[]) =>
    authedApi('/me/orders', orderDetailSchema, {
      method: 'POST',
      body: items ? { addressId, idempotencyKey, items } : { addressId, idempotencyKey },
    }),
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

export async function showOrder(queryClient: QueryClient, userId: string, order: OrderDetail) {
  if (currentUserId() !== userId) return;
  // a read of the order already on its way would land after this and put the older order back
  await queryClient.cancelQueries({ queryKey: orderKey(userId, order.number) });
  if (currentUserId() !== userId) return;
  queryClient.setQueryData(orderKey(userId, order.number), order);
  void queryClient.invalidateQueries({ queryKey: ordersKey(userId) });
}

/** "27 Oct 2026, 14:05 WIB": Jakarta time, as the store runs on WIB, and said so for a phone in another zone */
export function formatDateTime(iso: string): string {
  const local = new Date(iso).toLocaleString('en-GB', {
    timeZone: 'Asia/Jakarta',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${local} WIB`;
}
