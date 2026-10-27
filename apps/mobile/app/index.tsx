import { productPageSchema } from '@gear-store/shared';
import { useInfiniteQuery } from '@tanstack/react-query';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { ProductCard } from '../src/components/ProductCard';
import { api } from '../src/lib/api';
import { colors, mono } from '../src/theme';

const PAGE_SIZE = 24;

export default function ProductsScreen() {
  const products = useInfiniteQuery({
    queryKey: ['products'],
    queryFn: ({ pageParam }) => api(`/products?page=${pageParam}&pageSize=${PAGE_SIZE}`, productPageSchema),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.pageSize < last.total ? last.page + 1 : undefined),
  });

  if (products.isPending) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.signal} />
      </View>
    );
  }

  if (products.isError) {
    return (
      <View style={styles.center}>
        <Text style={styles.message}>{products.error.message}</Text>
        <Pressable onPress={() => void products.refetch()} style={styles.retry} accessibilityRole="button">
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  const items = products.data.pages.flatMap((page) => page.items);
  const total = products.data.pages[0]?.total ?? 0;

  return (
    <FlatList
      data={items}
      keyExtractor={(product) => product.slug}
      renderItem={({ item }) => <ProductCard product={item} />}
      contentContainerStyle={styles.list}
      ItemSeparatorComponent={() => <View style={styles.gap} />}
      ListHeaderComponent={<Text style={styles.count}>{total} parts</Text>}
      onEndReached={() => {
        if (products.hasNextPage && !products.isFetchingNextPage) void products.fetchNextPage();
      }}
      onEndReachedThreshold={0.5}
      ListFooterComponent={
        products.isFetchingNextPage ? (
          <ActivityIndicator color={colors.signal} style={styles.footer} />
        ) : undefined
      }
      refreshControl={
        <RefreshControl
          refreshing={products.isRefetching && !products.isFetchingNextPage}
          onRefresh={() => void products.refetch()}
          tintColor={colors.signal}
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  message: { color: colors.ink2, textAlign: 'center', fontSize: 15 },
  retry: { backgroundColor: colors.signal, paddingHorizontal: 20, paddingVertical: 12 },
  retryText: { color: '#15181a', fontWeight: '600' },
  list: { padding: 16 },
  gap: { height: 12 },
  count: { fontFamily: mono, fontSize: 12, color: colors.ink3, marginBottom: 12 },
  footer: { marginVertical: 16 },
});
