import { router } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../src/components/Button';
import { EmptyState } from '../../src/components/EmptyState';
import { useAuth } from '../../src/lib/auth';
import { count, formatRupiah } from '../../src/lib/format';
import { formatDateTime, statusColors, statusLabels, useOrders } from '../../src/lib/orders';
import { useBottomSpace } from '../../src/lib/use-bottom-space';
import { colors, mono } from '../../src/theme';

export default function OrdersScreen() {
  const state = useAuth();
  const list = useOrders();
  const bottom = useBottomSpace();

  if (state.status === 'signed-out') {
    return (
      <EmptyState message="Sign in to see your orders.">
        <Button label="Sign in" href="/account" />
      </EmptyState>
    );
  }
  if (state.status === 'restoring' || list.isPending) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.signal} />
      </View>
    );
  }
  if (!list.data) {
    return (
      <EmptyState message={list.error?.message ?? 'Something went wrong.'}>
        <Button label="Try again" onPress={() => void list.refetch()} />
      </EmptyState>
    );
  }

  return (
    <FlatList
      data={list.data}
      keyExtractor={(o) => o.number}
      contentContainerStyle={[styles.list, { paddingBottom: bottom }]}
      ItemSeparatorComponent={() => <View style={styles.gap} />}
      ListEmptyComponent={
        <EmptyState message="No orders yet.">
          <Button label="Browse parts" href="/products" />
        </EmptyState>
      }
      refreshControl={
        <RefreshControl
          refreshing={list.isRefetching}
          onRefresh={() => void list.refetch()}
          tintColor={colors.signal}
          colors={[colors.signal]}
          progressBackgroundColor={colors.alu50}
        />
      }
      renderItem={({ item }) => (
        // not a Link with asChild: its Slot merges the child's style as an object, so the pressed style would be lost
        <Pressable
          onPress={() => router.push({ pathname: '/orders/[number]', params: { number: item.number } })}
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          accessibilityRole="link"
          accessibilityLabel={`Order ${item.number}, ${statusLabels[item.status]}, ${formatRupiah(item.total)}`}
        >
          <View style={styles.body}>
            <View style={styles.top}>
              <Text style={styles.number}>{item.number}</Text>
              <Text style={[styles.status, { color: statusColors[item.status] }]}>
                {statusLabels[item.status]}
              </Text>
            </View>
            <View style={styles.top}>
              <Text style={styles.meta}>
                {formatDateTime(item.createdAt)} · {count(item.itemCount, 'item')}
              </Text>
              <Text style={styles.total}>{formatRupiah(item.total)}</Text>
            </View>
          </View>
          <Text style={styles.chevron} importantForAccessibility="no" accessibilityElementsHidden>
            ›
          </Text>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  list: { padding: 16, flexGrow: 1 },
  gap: { height: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: colors.bench,
    backgroundColor: colors.alu50,
    padding: 12,
  },
  pressed: { borderColor: colors.rule, opacity: 0.85 },
  body: { flex: 1, minWidth: 0, gap: 6 },
  // a long status at a large text size goes to the next line rather than past the screen's edge
  top: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    columnGap: 12,
  },
  number: { fontFamily: mono, fontSize: 14, fontWeight: '600', color: colors.ink },
  status: { fontSize: 13, fontWeight: '600' },
  meta: { fontSize: 13, color: colors.ink3, flexShrink: 1 },
  total: { fontFamily: mono, fontSize: 14, fontWeight: '600', color: colors.ink },
  chevron: { fontSize: 22, color: colors.ink3 },
});
