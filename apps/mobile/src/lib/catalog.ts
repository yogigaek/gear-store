import { categorySchema } from '@gear-store/shared';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { api, retryTransient } from './api';

/** the part types, with how many parts each has on sale */
export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: () => api('/categories', z.array(categorySchema)),
    staleTime: 10 * 60_000,
    retry: retryTransient,
  });
}
