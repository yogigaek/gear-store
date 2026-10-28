import { useCallback, useState } from 'react';

/**
 * A RefreshControl's state from the shopper's own pull only: background reads (polling, focus, invalidations)
 * would otherwise flash the spinner and, on iOS, move the content down under it.
 */
export function usePullRefresh(refetch: () => Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void refetch()
      .catch(() => undefined)
      .finally(() => setRefreshing(false));
  }, [refetch]);
  return { refreshing, onRefresh };
}
