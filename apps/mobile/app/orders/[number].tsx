import type { OrderDetail } from '@gear-store/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Link, Stack, useIsFocused, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { PartImage } from '../../src/components/parts';
import { ApiError } from '../../src/lib/api';
import { useAuth } from '../../src/lib/auth';
import { formatRupiah } from '../../src/lib/format';
import {
  formatDateTime,
  orders,
  ordersKey,
  showOrder,
  statusColors,
  statusLabels,
  useOrder,
} from '../../src/lib/orders';
import { colors, mono } from '../../src/theme';

export default function OrderScreen() {
  const { number } = useLocalSearchParams<{ number: string }>();
  const state = useAuth();
  // polling and pulls run only while this screen is the one in view, not from under another screen
  const focused = useIsFocused();
  const order = useOrder(number, focused);
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<'pay' | 'check' | 'cancel'>();
  const [error, setError] = useState<string>();

  // While a payment page is open for this order, ask Midtrans for the result when the app comes back to the
  // foreground (the browser was closed or left) and once a minute, as the web does: the API on a laptop cannot
  // receive Midtrans' webhook, and on Android the browser call returns as soon as the page opens.
  const userId = state.status === 'signed-in' ? state.user.id : null;
  const awaitingPayment = Boolean(order.data?.canPay && order.data.payment);
  useEffect(() => {
    if (!userId || !awaitingPayment || !focused) return;
    const pull = () =>
      void orders
        .pullPayment(number)
        .then((next) => showOrder(queryClient, userId, next))
        .catch(() => undefined);
    const timer = setInterval(pull, 60_000);
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') pull();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [userId, awaitingPayment, focused, number, queryClient]);

  // Coming back to the app re-reads the order, so one that expired or was paid elsewhere shows as it is now.
  const refetchOrder = order.refetch;
  useEffect(() => {
    if (!userId || !focused) return;
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void refetchOrder();
    });
    return () => sub.remove();
  }, [userId, focused, refetchOrder]);

  // the orders list shows each order's status: keep it in step when this one changes (not on first load)
  const status = order.data?.status;
  const seenStatus = useRef(status);
  useEffect(() => {
    if (!status || seenStatus.current === status) return;
    const changed = seenStatus.current !== undefined;
    seenStatus.current = status;
    if (userId && changed) void queryClient.invalidateQueries({ queryKey: ordersKey(userId) });
  }, [userId, status, queryClient]);

  if (state.status !== 'signed-in' || order.isPending) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: number }} />
        {state.status === 'signed-out' ? (
          <>
            <Text style={styles.message}>Sign in to see this order.</Text>
            <Link href="/account" asChild>
              <Pressable style={styles.primary} accessibilityRole="link">
                <Text style={styles.primaryText}>Sign in</Text>
              </Pressable>
            </Link>
          </>
        ) : (
          <ActivityIndicator color={colors.signal} />
        )}
      </View>
    );
  }
  if (order.isError && !order.data) {
    // an unknown or malformed number will not turn up by trying again
    const missing =
      order.error instanceof ApiError && (order.error.status === 404 || order.error.status === 400);
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: number }} />
        <Text style={styles.message}>
          {missing ? 'There is no such order on this account.' : order.error.message}
        </Text>
        {!missing && (
          <Pressable onPress={() => void order.refetch()} style={styles.primary} accessibilityRole="button">
            <Text style={styles.primaryText}>Try again</Text>
          </Pressable>
        )}
      </View>
    );
  }

  const o = order.data;
  const signedInId = state.user.id;

  const run = async (kind: 'pay' | 'check' | 'cancel', task: () => Promise<OrderDetail | void>) => {
    setBusy(kind);
    setError(undefined);
    try {
      const next = await task();
      if (next) await showOrder(queryClient, signedInId, next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
      // e.g. 409 "no longer waiting for payment": show the order as it now stands
      if (e instanceof ApiError && e.status === 409) void order.refetch();
    } finally {
      setBusy(undefined);
    }
  };

  // Midtrans' page opens in an in-app browser. Its "back to store" link points at the web store, so the shopper
  // closes the browser; iOS reports the close here, Android only that the page opened (the effect above covers it).
  const pay = () =>
    run('pay', async () => {
      const { redirectUrl } = await orders.paymentPage(o.number);
      const result = await WebBrowser.openBrowserAsync(redirectUrl);
      // Android reports only that the page opened: re-read the order, which now carries its payment, so the
      // pulls above start and run when the shopper comes back. iOS reports the close: ask Midtrans at once.
      if (result.type === 'opened') return orders.get(o.number);
      return orders.pullPayment(o.number);
    });

  const cancel = () =>
    Alert.alert('Cancel this order?', 'The parts go back on sale. This cannot be undone.', [
      { text: 'Keep order', style: 'cancel' },
      {
        text: 'Cancel order',
        style: 'destructive',
        onPress: () => void run('cancel', () => orders.cancel(o.number)),
      },
    ]);

  const waiting = o.status === 'PENDING_PAYMENT';
  const looseItems = o.items.filter((i) => i.buildId === null);

  return (
    <ScrollView
      contentContainerStyle={styles.page}
      refreshControl={
        <RefreshControl
          refreshing={order.isRefetching}
          onRefresh={() => void order.refetch()}
          tintColor={colors.signal}
        />
      }
    >
      <Stack.Screen options={{ title: o.number }} />
      <View style={styles.statusRow}>
        <Text style={[styles.status, { color: statusColors[o.status] }]}>{statusLabels[o.status]}</Text>
        <Text style={styles.date}>{formatDateTime(o.createdAt)}</Text>
      </View>
      {waiting && (
        <Text style={styles.note}>
          Pay by {formatDateTime(o.paymentExpiresAt)}, or the order expires and the parts go back on sale.
        </Text>
      )}
      {o.refundStatus === 'NEEDED' && (
        <Text style={styles.note}>A payment arrived after this order closed. It will be refunded.</Text>
      )}

      {o.canPay && (
        <Pressable
          onPress={() => void pay()}
          disabled={busy !== undefined}
          style={[styles.primary, busy !== undefined && styles.disabled]}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy !== undefined, busy: busy === 'pay' }}
        >
          <Text style={styles.primaryText}>
            {busy === 'pay' ? 'Opening payment…' : `Pay ${formatRupiah(o.total)}`}
          </Text>
        </Pressable>
      )}
      {waiting && (
        <Pressable
          onPress={() => void run('check', () => orders.pullPayment(o.number))}
          disabled={busy !== undefined}
          style={[styles.secondary, busy !== undefined && styles.disabled]}
          accessibilityRole="button"
        >
          <Text style={styles.secondaryText}>
            {busy === 'check' ? 'Checking…' : 'I have paid: check the status'}
          </Text>
        </Pressable>
      )}
      {error && <Text style={styles.problem}>{error}</Text>}

      <Text style={styles.label}>Items</Text>
      <View style={styles.items}>
        {looseItems.map((item) => (
          <View key={`${item.slug}:${item.colorKey}`} style={styles.item}>
            {item.module ? (
              <PartImage slug={item.slug} module={item.module} colorKey={item.colorKey} style={styles.art} />
            ) : (
              <View style={styles.art} />
            )}
            <View style={styles.itemBody}>
              <Text style={styles.itemName}>{item.name}</Text>
              {item.colorLabel && <Text style={styles.finish}>{item.colorLabel}</Text>}
              <Text style={styles.finish}>
                {item.quantity} × {formatRupiah(item.unitPrice)}
              </Text>
            </View>
            <Text style={styles.lineTotal}>{formatRupiah(item.lineTotal)}</Text>
          </View>
        ))}
        {o.builds.map((build) => (
          <View key={build.id} style={styles.item}>
            <View style={styles.art} />
            <View style={styles.itemBody}>
              <Text style={styles.itemName}>{build.label}</Text>
              {build.colorLabel && <Text style={styles.finish}>{build.colorLabel}</Text>}
              <Text style={styles.finish}>
                {build.quantity} × {formatRupiah(build.unitPrice)}
              </Text>
            </View>
            <Text style={styles.lineTotal}>{formatRupiah(build.lineTotal)}</Text>
          </View>
        ))}
      </View>

      <View style={styles.summary}>
        <Row label="Subtotal" value={formatRupiah(o.subtotal)} />
        <Row label="Shipping" value={formatRupiah(o.shippingFee)} />
        <Row label="Total" value={formatRupiah(o.total)} strong />
      </View>

      <Text style={styles.label}>Ship to</Text>
      <View style={styles.card}>
        <Text style={styles.itemName}>{o.shipping.recipient}</Text>
        <Text style={styles.line}>{o.shipping.phone}</Text>
        <Text style={styles.line}>{[o.shipping.line1, o.shipping.line2].filter(Boolean).join(', ')}</Text>
        <Text style={styles.line}>
          {o.shipping.city}, {o.shipping.province} {o.shipping.postalCode}
        </Text>
        {o.fulfilment.trackingNumber && (
          <Text style={styles.finish}>
            {o.fulfilment.courier} · {o.fulfilment.trackingNumber}
          </Text>
        )}
      </View>

      {o.canCancel && (
        <Pressable onPress={cancel} disabled={busy !== undefined} hitSlop={8} accessibilityRole="button">
          <Text style={[styles.cancel, busy !== undefined && styles.disabled]}>
            {busy === 'cancel' ? 'Cancelling…' : 'Cancel order'}
          </Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, strong && styles.strong]}>{label}</Text>
      <Text style={[styles.rowValue, strong && styles.strong]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  message: { color: colors.ink2, textAlign: 'center', fontSize: 15 },
  page: { padding: 16, gap: 12, paddingBottom: 32 },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 },
  status: { fontSize: 20, fontWeight: '800', textTransform: 'uppercase' },
  date: { fontFamily: mono, fontSize: 12, color: colors.ink3 },
  note: { fontSize: 13, color: colors.ink2, lineHeight: 19 },
  problem: { fontSize: 14, color: colors.danger },
  label: {
    fontFamily: mono,
    fontSize: 12,
    color: colors.ink3,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 8,
  },
  items: { borderWidth: 1, borderColor: colors.bench },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.bench,
  },
  art: { width: 56, height: 56, backgroundColor: colors.alu50 },
  itemBody: { flex: 1, minWidth: 0, gap: 2 },
  itemName: { fontSize: 15, fontWeight: '600', color: colors.ink },
  finish: { fontFamily: mono, fontSize: 11, color: colors.ink3 },
  lineTotal: { fontFamily: mono, fontSize: 13, fontWeight: '600', color: colors.ink },
  summary: { gap: 8, paddingTop: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  rowLabel: { fontSize: 14, color: colors.ink2 },
  rowValue: { fontFamily: mono, fontSize: 14, color: colors.ink },
  strong: { fontSize: 17, fontWeight: '700', color: colors.ink },
  card: { borderWidth: 1, borderColor: colors.bench, backgroundColor: colors.alu50, padding: 12, gap: 3 },
  line: { fontSize: 14, color: colors.ink2 },
  primary: {
    backgroundColor: colors.signal,
    paddingVertical: 14,
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  primaryText: { color: '#15181a', fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.4 },
  secondary: { borderWidth: 1, borderColor: colors.ink, paddingVertical: 12, alignItems: 'center' },
  secondaryText: { color: colors.ink, fontSize: 15, fontWeight: '600' },
  cancel: { fontSize: 14, color: colors.danger, textDecorationLine: 'underline', marginTop: 12 },
});
