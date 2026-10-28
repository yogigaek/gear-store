import { MAX_ADDRESSES, type Address } from '@gear-store/shared';
import { useQueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { Link, router, Stack, useFocusEffect, useNavigation, usePreventRemove } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ApiError } from '../src/lib/api';
import { useAuth } from '../src/lib/auth';
import { accountCartKey, useCart } from '../src/lib/cart';
import { checkoutKey, closeCheckout, hasOpenCheckout } from '../src/lib/checkout-key';
import { count, formatRupiah } from '../src/lib/format';
import { orders, showOrder, useAddresses } from '../src/lib/orders';
import { colors, mono } from '../src/theme';

export default function CheckoutScreen() {
  const state = useAuth();
  const cart = useCart();
  const addresses = useAddresses();
  const queryClient = useQueryClient();
  const navigation = useNavigation();
  const [chosen, setChosen] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  // header back, Android back and the iOS swipe all wait while an order is on its way
  const allowLeave = usePreventRemove(busy);
  // an address just saved on the form is the one to ship to, as on the web
  useFocusEffect(
    useCallback(() => {
      const added = orders.takeAddedAddress();
      if (added) setChosen(added);
    }, []),
  );

  if (state.status === 'restoring') return <Loading />;
  if (state.status === 'signed-out') {
    return (
      <View style={styles.center}>
        <Text style={styles.message}>Sign in to check out. Your cart moves to your account.</Text>
        <Link href="/account" asChild>
          <Pressable style={styles.primary} accessibilityRole="link">
            <Text style={styles.primaryText}>Sign in</Text>
          </Pressable>
        </Link>
      </View>
    );
  }
  if (cart.mode !== 'account' || cart.query.isPending || addresses.isPending) return <Loading />;
  // a failed refetch keeps what is on screen; only a first load that failed has nothing to show
  if (!cart.query.data || !addresses.data) {
    const message = (cart.query.error ?? addresses.error)?.message ?? 'Something went wrong.';
    return (
      <View style={styles.center}>
        <Text style={styles.message}>{message}</Text>
        <Pressable
          onPress={() => {
            void cart.query.refetch();
            void addresses.refetch();
          }}
          style={styles.primary}
          accessibilityRole="button"
        >
          <Text style={styles.primaryText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  const priced = cart.query.data;
  const list = addresses.data;
  const address = list.find((a) => a.id === chosen) ?? list.find((a) => a.isDefault) ?? list[0];
  const userId = state.user.id;
  // an attempt that ended without a clear answer (no reply, or a server error): the order may exist
  const maybePlaced = hasOpenCheckout(userId) && !busy;

  const place = async () => {
    if (!address) return;
    const key = checkoutKey(userId, randomUUID);
    setBusy(true);
    setError(undefined);
    try {
      const order = await orders.place(address.id, key);
      closeCheckout(key);
      await showOrder(queryClient, userId, order);
      // the API emptied the cart into the order; refreshed in the background, the order opens at once
      void queryClient.invalidateQueries({ queryKey: accountCartKey(userId) });
      const target = { pathname: '/orders/[number]', params: { number: order.number } } as const;
      // opened from here, the order takes this screen's place; with another screen on top, it opens over that one
      if (navigation.isFocused()) {
        allowLeave();
        router.replace(target);
      } else {
        router.push(target);
      }
    } catch (e) {
      // The cart is left as shown, so "Place order" stays available: if the order was placed but its reply was
      // lost, the same key brings back that order rather than placing a second one.
      setError(e instanceof Error ? e.message : 'Could not place the order. Try again.');
      if (e instanceof ApiError && e.status === 404) void addresses.refetch();
      // a refusal (4xx) placed nothing: the next attempt is a new order
      if (e instanceof ApiError && e.status >= 400 && e.status < 500) {
        closeCheckout(key);
        // e.g. a part withdrawn or short of stock since the cart was read: the summary is redrawn as it now is
        void queryClient.invalidateQueries({ queryKey: accountCartKey(userId) });
      }
    } finally {
      setBusy(false);
    }
  };

  const empty = priced.items.length + priced.builds.length === 0;
  // after an unclear failure the cart may already have become the order: the same key then simply returns it
  const canPlace = ((!empty && priced.canCheckout) || maybePlaced) && !!address && !busy;

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Stack.Screen options={{ headerBackVisible: !busy, gestureEnabled: !busy }} />
      <Text style={styles.label}>Ship to</Text>
      {list.length === 0 ? (
        <Text style={styles.note}>You have no saved address yet.</Text>
      ) : (
        <View style={styles.addresses} accessibilityRole="radiogroup">
          {list.map((a) => (
            <AddressOption
              key={a.id}
              address={a}
              selected={a.id === address?.id}
              onSelect={() => setChosen(a.id)}
            />
          ))}
        </View>
      )}
      {list.length < MAX_ADDRESSES ? (
        <Link href="/addresses/new" asChild>
          <Pressable
            style={[styles.secondary, busy && styles.disabled]}
            disabled={busy}
            accessibilityRole="link"
            accessibilityState={{ disabled: busy }}
          >
            <Text style={styles.secondaryText}>Add an address</Text>
          </Pressable>
        </Link>
      ) : (
        <Text style={styles.note}>
          You have saved {MAX_ADDRESSES} addresses, the most an account keeps. Remove one on the website to
          add another.
        </Text>
      )}

      <View style={styles.summary}>
        <Row label={`Subtotal · ${count(priced.itemCount, 'item')}`} value={formatRupiah(priced.subtotal)} />
        <Row
          label={address ? `Shipping · ${address.shippingEta}` : 'Shipping'}
          value={address ? formatRupiah(address.shippingFee) : '—'}
        />
        <Row label="Total" value={formatRupiah(priced.subtotal + (address?.shippingFee ?? 0))} strong />
      </View>

      {empty && !maybePlaced && <Text style={styles.problem}>Your cart is empty.</Text>}
      {maybePlaced && (
        <Text style={styles.note}>
          The order may have gone through. Placing it again opens that order instead of making a second one.
        </Text>
      )}
      {!empty && !priced.canCheckout && (
        <Text style={styles.problem}>
          Some lines in your cart cannot be bought as they stand. Fix them in the cart.
        </Text>
      )}
      {error && <Text style={styles.problem}>{error}</Text>}

      <Pressable
        onPress={() => void place()}
        disabled={!canPlace}
        style={[styles.primary, !canPlace && styles.disabled]}
        accessibilityRole="button"
        accessibilityState={{ disabled: !canPlace, busy }}
      >
        <Text style={styles.primaryText}>{busy ? 'Placing order…' : 'Place order'}</Text>
      </Pressable>
      <Text style={styles.note}>
        The parts are held for you while you pay. Payment is by Midtrans (sandbox: no real money moves).
      </Text>
    </ScrollView>
  );
}

function AddressOption({
  address,
  selected,
  onSelect,
}: {
  address: Address;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <Pressable
      onPress={onSelect}
      style={[styles.address, selected && styles.addressSelected]}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
    >
      <Text style={styles.recipient}>
        {address.recipient}
        {address.label ? ` · ${address.label}` : ''}
      </Text>
      <Text style={styles.addressLine}>{[address.line1, address.line2].filter(Boolean).join(', ')}</Text>
      <Text style={styles.addressLine}>
        {address.city}, {address.province} {address.postalCode}
      </Text>
      <Text style={styles.fee}>
        Shipping {formatRupiah(address.shippingFee)} · {address.shippingEta}
      </Text>
    </Pressable>
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

function Loading() {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.signal} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  message: { color: colors.ink2, textAlign: 'center', fontSize: 15 },
  page: { padding: 16, gap: 12 },
  label: {
    fontFamily: mono,
    fontSize: 12,
    color: colors.ink3,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  addresses: { gap: 10 },
  address: { borderWidth: 1, borderColor: colors.bench, backgroundColor: colors.alu50, padding: 12, gap: 3 },
  addressSelected: { borderColor: colors.signal },
  recipient: { fontSize: 15, fontWeight: '600', color: colors.ink },
  addressLine: { fontSize: 14, color: colors.ink2 },
  fee: { fontFamily: mono, fontSize: 12, color: colors.ink3, marginTop: 4 },
  summary: { borderTopWidth: 1, borderTopColor: colors.bench, paddingTop: 14, marginTop: 8, gap: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 },
  rowLabel: { fontSize: 14, color: colors.ink2, flexShrink: 1 },
  rowValue: { fontFamily: mono, fontSize: 14, color: colors.ink },
  strong: { fontSize: 17, fontWeight: '700', color: colors.ink },
  problem: { fontSize: 14, color: colors.danger },
  note: { fontSize: 13, color: colors.ink3, lineHeight: 19 },
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
});
