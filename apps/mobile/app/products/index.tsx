import { productPageSchema } from '@gear-store/shared';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ProductCard } from '../../src/components/ProductCard';
import { api } from '../../src/lib/api';
import { useCategories } from '../../src/lib/catalog';
import { colors, mono } from '../../src/theme';

const PAGE_SIZE = 24;
/** the API's limit for a search term (productQuerySchema) */
const MAX_QUERY = 80;

/** what the shopper typed, settled: a search is sent once typing pauses, not on every keystroke */
function useSettled(value: string, ms = 300): string {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

/** the parts matching a category and a search term, a page at a time */
function useProducts(category: string | undefined, q: string) {
  return useInfiniteQuery({
    queryKey: ['products', { category, q }],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ page: String(pageParam), pageSize: String(PAGE_SIZE) });
      if (category) params.set('category', category);
      if (q) params.set('q', q);
      return api(`/products?${params.toString()}`, productPageSchema);
    },
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.pageSize < last.total ? last.page + 1 : undefined),
    // the previous results stay while a new filter loads, so the list does not flash empty
    placeholderData: keepPreviousData,
  });
}

export default function ProductsScreen() {
  // the home screen opens a part type straight away; the chips change it from here
  const params = useLocalSearchParams<{ category?: string }>();
  const [category, setCategory] = useState(params.category || undefined);
  const [typed, setTyped] = useState('');
  const settled = useSettled(typed.trim());
  // clearing the box applies at once, so a reset does not first search the old term without its category
  const q = typed.trim() === '' ? '' : settled;

  const categories = useCategories();

  const products = useProducts(category, q);

  return (
    <View style={styles.fill}>
      <View style={styles.filters}>
        <TextInput
          value={typed}
          onChangeText={setTyped}
          placeholder="Search parts"
          placeholderTextColor={colors.ink3}
          style={styles.search}
          maxLength={MAX_QUERY}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
          accessibilityLabel="Search parts"
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
          keyboardShouldPersistTaps="handled"
        >
          <Chip label="All" selected={!category} onPress={() => setCategory(undefined)} />
          {categories.data
            ?.filter((c) => c.productCount > 0)
            .map((c) => (
              <Chip
                key={c.slug}
                label={c.name}
                selected={category === c.slug}
                onPress={() => setCategory(category === c.slug ? undefined : c.slug)}
              />
            ))}
        </ScrollView>
      </View>
      <Results
        products={products}
        filterKey={`${category ?? ''}|${q}`}
        onClear={() => {
          setTyped('');
          setCategory(undefined);
        }}
      />
    </View>
  );
}

function Results({
  products,
  filterKey,
  onClear,
}: {
  products: ReturnType<typeof useProducts>;
  filterKey: string;
  onClear: () => void;
}) {
  if (products.isPending) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.signal} />
      </View>
    );
  }

  if (products.isError && !products.data) {
    return (
      <View style={styles.center}>
        <Text style={styles.message}>{products.error.message}</Text>
        <Pressable onPress={() => void products.refetch()} style={styles.retry} accessibilityRole="button">
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  const items = products.data?.pages.flatMap((page) => page.items) ?? [];
  const total = products.data?.pages[0]?.total ?? 0;

  return (
    <FlatList
      // a new filter opens its results at the top, not at the old list's scroll position
      key={filterKey}
      data={items}
      keyExtractor={(product) => product.slug}
      renderItem={({ item }) => <ProductCard product={item} />}
      contentContainerStyle={styles.list}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      ItemSeparatorComponent={() => <View style={styles.gap} />}
      ListHeaderComponent={
        <>
          {products.isError && <Text style={styles.banner}>{products.error.message}</Text>}
          <Text style={styles.count}>
            {total} {total === 1 ? 'part' : 'parts'}
            {products.isPlaceholderData ? ' · updating…' : ''}
          </Text>
        </>
      }
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.message}>No parts match.</Text>
          <Pressable onPress={onClear} style={styles.retry} accessibilityRole="button">
            <Text style={styles.retryText}>Show all parts</Text>
          </Pressable>
        </View>
      }
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
          refreshing={products.isRefetching && !products.isFetchingNextPage && !products.isPlaceholderData}
          onRefresh={() => void products.refetch()}
          tintColor={colors.signal}
        />
      }
    />
  );
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
      hitSlop={{ top: 8, bottom: 8 }}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  filters: { paddingTop: 12, gap: 10, borderBottomWidth: 1, borderBottomColor: colors.bench },
  search: {
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: colors.benchStrong,
    backgroundColor: colors.alu50,
    color: colors.ink,
    fontSize: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  chips: { paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  chip: { borderWidth: 1, borderColor: colors.benchStrong, paddingHorizontal: 12, paddingVertical: 7 },
  chipSelected: { borderColor: colors.signal, backgroundColor: colors.signal },
  chipText: { fontFamily: mono, fontSize: 12, color: colors.ink2 },
  chipTextSelected: { color: '#15181a', fontWeight: '600' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  empty: { alignItems: 'center', gap: 16, paddingTop: 48 },
  message: { color: colors.ink2, textAlign: 'center', fontSize: 15 },
  retry: { backgroundColor: colors.signal, paddingHorizontal: 20, paddingVertical: 12 },
  retryText: { color: '#15181a', fontWeight: '600' },
  list: { padding: 16, flexGrow: 1 },
  gap: { height: 12 },
  count: { fontFamily: mono, fontSize: 12, color: colors.ink3, marginBottom: 12 },
  footer: { marginVertical: 16 },
  banner: { fontSize: 13, color: colors.danger, marginBottom: 8 },
});
