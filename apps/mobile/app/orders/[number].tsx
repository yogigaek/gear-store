import { paymentWindowMinutes, type OrderDetail } from '@gear-store/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useIsFocused, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Button } from '../../src/components/Button';
import { EmptyState } from '../../src/components/EmptyState';
import { LineList, lineArt, type Line } from '../../src/components/LineList';
import { ArtPlaceholder, PartImage } from '../../src/components/parts';
import { SandboxPaymentGuide } from '../../src/components/SandboxPaymentGuide';
import { ApiError } from '../../src/lib/api';
import { useAuth } from '../../src/lib/auth';
import { count, formatRupiah, lineDetail } from '../../src/lib/format';
import {
  formatDateTime,
  orders,
  ordersKey,
  showOrder,
  statusColors,
  statusLabels,
  useOrder,
} from '../../src/lib/orders';
import { useBottomSpace } from '../../src/lib/use-bottom-space';
import { colors, mono } from '../../src/theme';

export default function OrderScreen() {
  const { number, pay: payParam } = useLocalSearchParams<{ number: string; pay?: string }>();
  const state = useAuth();
  // polling and pulls run only while this screen is the one in view, not from under another screen
  const focused = useIsFocused();
  const order = useOrder(number, focused);
  const queryClient = useQueryClient();
  const bottom = useBottomSpace();
  const [busy, setBusy] = useState<'pay' | 'check' | 'cancel'>();
  const [error, setError] = useState<string>();
  // just placed at checkout (?pay=1): the payment page opens by itself, once, as the web's "Place order and pay"
  const autoPay = useRef(payParam === '1');
  const [justPlaced] = useState(payParam === '1');

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

  // Coming back to the app re-reads the order even when it is not yet stale, so one that expired or was paid
  // elsewhere shows as it is now; a read focusManager already started for it is joined, not repeated.
  const refetchOrder = order.refetch;
  useEffect(() => {
    if (!userId || !focused) return;
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void refetchOrder({ cancelRefetch: false });
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

  const run = useCallback(
    async (kind: 'pay' | 'check' | 'cancel', task: () => Promise<OrderDetail | void>) => {
      if (!userId) return;
      setBusy(kind);
      setError(undefined);
      try {
        const next = await task();
        if (next) await showOrder(queryClient, userId, next);
      } catch (e) {
        // e.g. 503 when Midtrans is not set up on this server: the API says so, and the order stays as it is
        setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
        // e.g. 409 "no longer waiting for payment": show the order as it now stands
        if (e instanceof ApiError && e.status === 409) void refetchOrder();
      } finally {
        setBusy(undefined);
      }
    },
    [userId, queryClient, refetchOrder],
  );

  // Midtrans' page opens in an in-app browser. After paying it lands on the web's /payment-done, which asks the
  // shopper to close it; iOS reports the close here, Android only that the page opened (the effect above covers it).
  const pay = useCallback(
    () =>
      run('pay', async () => {
        autoPay.current = false;
        const { redirectUrl } = await orders.paymentPage(number);
        const result = await WebBrowser.openBrowserAsync(redirectUrl);
        // Android reports only that the page opened: re-read the order, which now carries its payment, so the
        // pulls above start and run when the shopper comes back. iOS reports the close: ask Midtrans at once.
        if (result.type === 'opened') return orders.get(number);
        return orders.pullPayment(number);
      }),
    [run, number],
  );

  const canPayNow = order.data?.canPay;
  // leaving the screen before the page opened means the shopper chose something else: it does not open later
  useEffect(() => {
    if (!focused) autoPay.current = false;
  }, [focused]);
  useEffect(() => {
    if (!autoPay.current || !focused || canPayNow === undefined) return;
    if (!canPayNow) {
      autoPay.current = false;
      return;
    }
    // once the screen has slid in: iOS will not present the browser over a screen still in its transition
    const timer = setTimeout(() => {
      autoPay.current = false;
      void pay();
    }, 450);
    return () => clearTimeout(timer);
  }, [focused, canPayNow, pay]);

  if (state.status !== 'signed-in' || order.isPending) {
    return state.status === 'signed-out' ? (
      <EmptyState message="Sign in to see this order.">
        <Button label="Sign in" href="/account" />
      </EmptyState>
    ) : (
      <View style={styles.center}>
        <ActivityIndicator color={colors.signal} />
      </View>
    );
  }
  if (order.isError && !order.data) {
    // an unknown or malformed number will not turn up by trying again
    const missing =
      order.error instanceof ApiError && (order.error.status === 404 || order.error.status === 400);
    return (
      <EmptyState message={missing ? 'There is no such order on this account.' : order.error.message}>
        {missing ? (
          <Button label="Your orders" href="/orders" />
        ) : (
          <Button label="Try again" onPress={() => void order.refetch()} />
        )}
      </EmptyState>
    );
  }

  const o = order.data;

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

  return (
    <ScrollView
      contentContainerStyle={[styles.page, { paddingBottom: bottom }]}
      refreshControl={
        <RefreshControl
          refreshing={order.isRefetching}
          onRefresh={() => void order.refetch()}
          tintColor={colors.signal}
          colors={[colors.signal]}
          progressBackgroundColor={colors.alu50}
        />
      }
    >
      <Text style={styles.number} selectable>
        {o.number}
      </Text>
      <View style={styles.statusRow}>
        <Text style={[styles.status, { color: statusColors[o.status] }]}>{statusLabels[o.status]}</Text>
        <Text style={styles.date}>{formatDateTime(o.createdAt)}</Text>
      </View>
      {waiting &&
        (justPlaced ? (
          <Text style={styles.note} accessibilityLiveRegion="polite">
            Order placed. Pay within {paymentWindowMinutes(state.user.isDemo)} minutes to keep the parts (by{' '}
            {formatDateTime(o.paymentExpiresAt)}).
          </Text>
        ) : (
          <Text style={styles.note}>
            Pay by {formatDateTime(o.paymentExpiresAt)}, or the order expires and the parts go back on sale.
          </Text>
        ))}
      {o.refundStatus === 'NEEDED' && (
        <Text style={styles.note}>A payment arrived after this order closed. It will be refunded.</Text>
      )}

      {o.canPay && (
        <Button
          label={busy === 'pay' ? 'Opening payment…' : `Pay ${formatRupiah(o.total)}`}
          onPress={() => void pay()}
          disabled={busy !== undefined}
          busy={busy === 'pay'}
        />
      )}
      {waiting && (
        <Button
          variant="secondary"
          label={busy === 'check' ? 'Checking…' : 'Check payment status'}
          onPress={() => void run('check', () => orders.pullPayment(o.number))}
          disabled={busy !== undefined}
          busy={busy === 'check'}
        />
      )}
      {error && (
        <Text style={styles.problem} accessibilityLiveRegion="polite">
          {error}
        </Text>
      )}
      {o.canPay && <SandboxPaymentGuide initiallyOpen />}

      <Text style={styles.label}>Items</Text>
      <LineList lines={orderLines(o)} />

      <View style={styles.summary}>
        <Row label="Subtotal" value={formatRupiah(o.subtotal)} />
        <Row label="Shipping" value={formatRupiah(o.shippingFee)} />
        <Row label="Total" value={formatRupiah(o.total)} strong />
      </View>

      <Text style={styles.label}>Ship to</Text>
      <View style={styles.card}>
        <Text style={styles.recipient}>{o.shipping.recipient}</Text>
        <Text style={styles.line}>{o.shipping.phone}</Text>
        <Text style={styles.line}>{[o.shipping.line1, o.shipping.line2].filter(Boolean).join(', ')}</Text>
        <Text style={styles.line}>
          {o.shipping.city}, {o.shipping.province} {o.shipping.postalCode}
        </Text>
        {o.fulfilment.trackingNumber && (
          <Text style={styles.tracking} selectable>
            {o.fulfilment.courier} · {o.fulfilment.trackingNumber}
          </Text>
        )}
      </View>

      {o.canCancel && (
        <Button
          variant="ghost"
          danger
          label={busy === 'cancel' ? 'Cancelling…' : 'Cancel order'}
          onPress={cancel}
          disabled={busy !== undefined}
          busy={busy === 'cancel'}
          style={styles.cancel}
        />
      )}
    </ScrollView>
  );
}

/** the parts bought on their own, then each bike, drawn with its frame's still */
function orderLines(o: OrderDetail): Line[] {
  return [
    ...o.items
      .filter((i) => i.buildId === null)
      .map((i) => ({
        key: `part:${i.slug}:${i.colorKey}`,
        // a part gone from the catalogue has no module, and so no still
        art: i.module ? (
          <PartImage slug={i.slug} module={i.module} colorKey={i.colorKey} style={lineArt} />
        ) : (
          <ArtPlaceholder label="Part" style={lineArt} />
        ),
        name: i.name,
        detail: lineDetail(i.quantity, i.model, i.colorLabel),
        total: formatRupiah(i.lineTotal),
      })),
    ...o.builds.map((b) => {
      const parts = o.items.filter((i) => i.buildId === b.id);
      const frame = parts.find((i) => i.module === 'FRAME');
      return {
        key: `bike:${b.id}`,
        art: frame ? (
          <PartImage slug={frame.slug} module="FRAME" colorKey={b.colorKey} style={lineArt} />
        ) : (
          <ArtPlaceholder label="Bike" style={lineArt} />
        ),
        name: b.label,
        detail: lineDetail(b.quantity, count(parts.length, 'part'), b.colorLabel),
        total: formatRupiah(b.lineTotal),
      };
    }),
  ];
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  page: { padding: 16, gap: 12 },
  number: { fontFamily: mono, fontSize: 13, color: colors.ink3, letterSpacing: 0.6 },
  // a long status ("Waiting for payment") puts the date on the next line instead of pushing the page wider
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    columnGap: 12,
    rowGap: 2,
  },
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
  summary: { gap: 8, paddingTop: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 },
  rowLabel: { fontSize: 14, color: colors.ink2, flexShrink: 1 },
  rowValue: { flexShrink: 0, fontFamily: mono, fontSize: 14, color: colors.ink },
  strong: { fontSize: 17, fontWeight: '700', color: colors.ink },
  card: { borderWidth: 1, borderColor: colors.bench, backgroundColor: colors.alu50, padding: 12, gap: 3 },
  recipient: { fontSize: 15, fontWeight: '600', color: colors.ink },
  line: { fontSize: 14, color: colors.ink2 },
  tracking: { fontFamily: mono, fontSize: 11, color: colors.ink3 },
  cancel: { marginTop: 4 },
});
