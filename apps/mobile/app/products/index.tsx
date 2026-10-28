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
import { Button } from '../../src/components/Button';
import { EmptyState } from '../../src/components/EmptyState';
import { Loading } from '../../src/components/Loading';
import { ProductCard } from '../../src/components/ProductCard';
import { api } from '../../src/lib/api';
import { useCategories } from '../../src/lib/catalog';
import { useBottomSpace } from '../../src/lib/use-bottom-space';
import { usePullRefresh } from '../../src/lib/use-pull-refresh';
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

/** a route param given twice (`?category=a&category=b`) arrives as a list: the first one counts */
const firstParam = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) || undefined;

export default function ProductsScreen() {
  // the home screen opens a part type straight away; the chips change it from here
  const params = useLocalSearchParams<{ category?: string | string[] }>();
  const [category, setCategory] = useState(firstParam(params.category));
  const [typed, setTyped] = useState('');
  const settled = useSettled(typed.trim());
  // clearing the box applies at once, so a reset does not first search the old term without its category
  const q = typed.trim() === '' ? '' : settled;

  const categories = useCategories();

  const products = useProducts(category, q);

  return (
    <View style={styles.fill}>
      <View style={styles.filters}>
        <View style={styles.search}>
          <TextInput
            value={typed}
            onChangeText={setTyped}
            placeholder="Search parts"
            placeholderTextColor={colors.ink3}
            style={styles.searchInput}
            maxLength={MAX_QUERY}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel="Search parts"
          />
          {/* the same control on both platforms: Android's text fields have no clear button of their own */}
          {typed !== '' && (
            <Pressable
              onPress={() => setTyped('')}
              style={({ pressed }) => [styles.clear, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <Text style={styles.clearText}>Clear</Text>
            </Pressable>
          )}
        </View>
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
  const bottom = useBottomSpace();
  const pull = usePullRefresh(products.refetch);
  if (products.isPending) return <Loading />;

  if (products.isError && !products.data) {
    return (
      <EmptyState message={products.error.message}>
        <Button label="Try again" onPress={() => void products.refetch()} />
      </EmptyState>
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
      contentContainerStyle={[styles.list, { paddingBottom: bottom }]}
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
          <Button label="Show all parts" onPress={onClear} />
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
          {...pull}
          tintColor={colors.signal}
          colors={[colors.signal]}
          progressBackgroundColor={colors.alu50}
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
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: colors.field,
    backgroundColor: colors.alu50,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    color: colors.ink,
    fontSize: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  clear: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
  clearText: { fontFamily: mono, fontSize: 12, color: colors.ink2, textTransform: 'uppercase' },
  pressed: { opacity: 0.6 },
  chips: { paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  chip: { borderWidth: 1, borderColor: colors.benchStrong, paddingHorizontal: 12, paddingVertical: 7 },
  // a ring, not a fill: signal yellow as a fill is kept for the main action
  chipSelected: { borderColor: colors.signal },
  chipText: { fontFamily: mono, fontSize: 12, color: colors.ink2 },
  chipTextSelected: { color: colors.ink, fontWeight: '600' },
  empty: { alignItems: 'center', gap: 16, paddingTop: 48 },
  message: { color: colors.ink2, textAlign: 'center', fontSize: 15 },
  list: { padding: 16, flexGrow: 1 },
  gap: { height: 12 },
  count: { fontFamily: mono, fontSize: 12, color: colors.ink3, marginBottom: 12 },
  footer: { marginVertical: 16 },
  banner: { fontSize: 13, color: colors.danger, marginBottom: 8 },
});
