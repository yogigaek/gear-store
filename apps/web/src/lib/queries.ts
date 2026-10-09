import {
  brandSchema,
  categorySchema,
  productDetailSchema,
  productPageSchema,
  wishlistSchema,
  type ProductQuery,
  type ProductSummary,
} from '@gear-store/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { api } from './api';
import { useAuth } from './auth-context';

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: ({ signal }) => api('/categories', { schema: z.array(categorySchema), signal }),
    staleTime: 5 * 60_000,
  });
}

export function useBrands() {
  return useQuery({
    queryKey: ['brands'],
    queryFn: ({ signal }) => api('/brands', { schema: z.array(brandSchema), signal }),
    staleTime: 5 * 60_000,
  });
}

export function toSearchParams(query: Partial<ProductQuery>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  return params;
}

export function useProducts(query: Partial<ProductQuery>) {
  const qs = toSearchParams(query).toString();
  return useQuery({
    queryKey: ['products', qs],
    queryFn: ({ signal }) => api(`/products?${qs}`, { schema: productPageSchema, signal }),
    // keep showing the last page while the next filter loads, instead of flashing an empty grid
    placeholderData: keepPreviousData,
  });
}

export function useProduct(slug: string) {
  return useQuery({
    queryKey: ['product', slug],
    queryFn: ({ signal }) =>
      api(`/products/${encodeURIComponent(slug)}`, { schema: productDetailSchema, signal }),
  });
}

export function useWishlist() {
  const { status, authed } = useAuth();
  return useQuery({
    queryKey: ['me', 'wishlist'],
    queryFn: ({ signal }) =>
      authed((accessToken) => api('/me/wishlist', { accessToken, schema: wishlistSchema, signal })),
    enabled: status === 'signed-in',
  });
}

/** Save or unsave, with the heart flipping at once and rolling back if the request fails. */
export function useToggleWishlist() {
  const { authed } = useAuth();
  const queryClient = useQueryClient();
  const key = ['me', 'wishlist'];
  return useMutation({
    mutationFn: ({ product, save }: { product: ProductSummary; save: boolean }) =>
      authed((accessToken) =>
        api(`/me/wishlist/${product.slug}`, { method: save ? 'PUT' : 'DELETE', accessToken }),
      ),
    onMutate: async ({ product, save }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ProductSummary[]>(key);
      queryClient.setQueryData<ProductSummary[]>(key, (list = []) =>
        save
          ? [product, ...list.filter((p) => p.slug !== product.slug)]
          : list.filter((p) => p.slug !== product.slug),
      );
      return { previous };
    },
    onError: (_error, _vars, context) => queryClient.setQueryData(key, context?.previous),
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}
