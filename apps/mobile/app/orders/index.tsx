import { Link } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../src/lib/auth';
import { formatRupiah } from '../../src/lib/format';
import { formatDateTime, statusLabels, useOrders } from '../../src/lib/orders';
import { colors, mono } from '../../src/theme';

export default function OrdersScreen() {
  const state = useAuth();
  const list = useOrders();

  if (state.status === 'signed-out') {
    return (
      <View style={styles.center}>
        <Text style={styles.message}>Sign in to see your orders.</Text>
      </View>
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
      <View style={styles.center}>
        <Text style={styles.message}>{list.error?.message ?? 'Something went wrong.'}</Text>
        <Pressable onPress={() => void list.refetch()} style={styles.primary} accessibilityRole="button">
          <Text style={styles.primaryText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <FlatList
      data={list.data}
      keyExtractor={(o) => o.number}
      contentContainerStyle={styles.list}
      ItemSeparatorComponent={() => <View style={styles.gap} />}
      ListEmptyComponent={<Text style={styles.message}>No orders yet.</Text>}
      refreshControl={
        <RefreshControl
          refreshing={list.isRefetching}
          onRefresh={() => void list.refetch()}
          tintColor={colors.signal}
        />
      }
      renderItem={({ item }) => (
        <Link href={{ pathname: '/orders/[number]', params: { number: item.number } }} asChild>
          <Pressable style={styles.row} accessibilityRole="link">
            <View style={styles.top}>
              <Text style={styles.number}>{item.number}</Text>
              <Text style={[styles.status, item.status === 'PENDING_PAYMENT' && styles.waiting]}>
                {statusLabels[item.status]}
              </Text>
            </View>
            <View style={styles.top}>
              <Text style={styles.meta}>
                {formatDateTime(item.createdAt)} · {item.itemCount} items
              </Text>
              <Text style={styles.total}>{formatRupiah(item.total)}</Text>
            </View>
          </Pressable>
        </Link>
      )}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  message: { color: colors.ink2, textAlign: 'center', fontSize: 15 },
  primary: { backgroundColor: colors.signal, paddingHorizontal: 20, paddingVertical: 12 },
  primaryText: { color: '#15181a', fontWeight: '600' },
  list: { padding: 16, flexGrow: 1 },
  gap: { height: 10 },
  row: { borderWidth: 1, borderColor: colors.bench, backgroundColor: colors.alu50, padding: 12, gap: 6 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 },
  number: { fontFamily: mono, fontSize: 14, fontWeight: '600', color: colors.ink },
  status: { fontSize: 13, fontWeight: '600', color: colors.ok },
  waiting: { color: colors.signal },
  meta: { fontSize: 13, color: colors.ink3, flexShrink: 1 },
  total: { fontFamily: mono, fontSize: 14, fontWeight: '600', color: colors.ink },
});
