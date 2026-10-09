import {
  adminCategorySchema,
  adminOrderRowSchema,
  adminOrderSchema,
  adminProductRowSchema,
  adminProductSchema,
  adminStatsSchema,
  adminUserRowSchema,
  pageOf,
  type AdminCategoryInput,
  type AdminOrder,
  type AdminProductInput,
  type ShipInput,
} from '@gear-store/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { api } from './api';
import { useAuth } from './auth-context';

type Method = 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** GET an admin resource with the access token; the key is the path itself, so related lists refresh together. */
function useAdminGet<S extends z.ZodType>(path: string, schema: S) {
  const { status, authed } = useAuth();
  return useQuery({
    queryKey: ['admin', path],
    queryFn: ({ signal }) => authed((accessToken) => api(`/admin${path}`, { accessToken, schema, signal })),
    enabled: status === 'signed-in',
    placeholderData: keepPreviousData,
  });
}

function useAdminSend<S extends z.ZodType, V>(
  method: Method,
  path: (vars: V) => string,
  schema: S | undefined,
  body?: (vars: V) => unknown,
) {
  const { authed } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: V) =>
      authed((accessToken) =>
        api(`/admin${path(vars)}`, { method, accessToken, schema, body: body?.(vars) }),
      ),
    // every admin change can move a number somewhere else (stock, revenue, counts): refetch what is on screen
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin'] }),
  });
}

const qs = (params: Record<string, string | number | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const useAdminStats = (days: number) => useAdminGet(`/stats${qs({ days })}`, adminStatsSchema);

export const useAdminOrders = (params: { status?: string; refund?: string; q?: string; page: number }) =>
  useAdminGet(`/orders${qs(params)}`, pageOf(adminOrderRowSchema));
export const useAdminOrder = (number: string) => useAdminGet(`/orders/${number}`, adminOrderSchema);
export function useAdminOrderActions(number: string) {
  const queryClient = useQueryClient();
  const store = (order: AdminOrder) => queryClient.setQueryData(['admin', `/orders/${number}`], order);
  const ship = useAdminSend(
    'POST',
    () => `/orders/${number}/ship`,
    adminOrderSchema,
    (input: ShipInput) => input,
  );
  const deliver = useAdminSend('POST', () => `/orders/${number}/deliver`, adminOrderSchema);
  const refund = useAdminSend('POST', () => `/orders/${number}/refund`, adminOrderSchema);
  return {
    ship: { ...ship, mutate: (input: ShipInput) => ship.mutate(input, { onSuccess: store }) },
    deliver: { ...deliver, mutate: () => deliver.mutate(undefined, { onSuccess: store }) },
    refund: { ...refund, mutate: () => refund.mutate(undefined, { onSuccess: store }) },
  };
}

export const useAdminProducts = (params: { q?: string; page: number }) =>
  useAdminGet(`/products${qs(params)}`, pageOf(adminProductRowSchema));
export const useAdminProduct = (slug: string) => useAdminGet(`/products/${slug}`, adminProductSchema);
export const useCreateProduct = () =>
  useAdminSend(
    'POST',
    () => '/products',
    adminProductSchema,
    (input: AdminProductInput) => input,
  );
export const useUpdateProduct = (slug: string) =>
  useAdminSend(
    'PUT',
    () => `/products/${slug}`,
    adminProductSchema,
    (input: AdminProductInput & { expectedUpdatedAt: string }) => input,
  );

export const useAdminCategories = () => useAdminGet('/categories', z.array(adminCategorySchema));
export const useSaveCategory = () =>
  useAdminSend(
    'PUT',
    ({ slug }: { slug: string; input: AdminCategoryInput }) => `/categories/${slug}`,
    adminCategorySchema,
    ({ input }) => input,
  );
export const useCreateCategory = () =>
  useAdminSend(
    'POST',
    () => '/categories',
    adminCategorySchema,
    (input: AdminCategoryInput) => input,
  );
export const useDeleteCategory = () =>
  useAdminSend('DELETE', (slug: string) => `/categories/${slug}`, undefined);

export const useAdminUsers = (params: { q?: string; page: number }) =>
  useAdminGet(`/users${qs(params)}`, pageOf(adminUserRowSchema));
export const useSetRole = () =>
  useAdminSend(
    'PATCH',
    ({ id }: { id: string; role: 'ADMIN' | 'CUSTOMER' }) => `/users/${id}/role`,
    adminUserRowSchema,
    ({ role }) => ({ role }),
  );
