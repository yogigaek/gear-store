import {
  MAX_ADDRESSES,
  MAX_CART_LINES,
  MAX_LINE_QUANTITY,
  paymentWindowMinutes,
  type Address,
  type Cart,
  type CartLineInput,
} from '@gear-store/shared';
import { useQueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import {
  router,
  Stack,
  useFocusEffect,
  useLocalSearchParams,
  useNavigation,
  usePreventRemove,
} from 'expo-router';
import { useCallback, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BottomBar } from '../src/components/BottomBar';
import { Button } from '../src/components/Button';
import { EmptyCart, EmptyState } from '../src/components/EmptyState';
import { LineList, lineArt, type Line } from '../src/components/LineList';
import { ArtPlaceholder, PartImage } from '../src/components/parts';
import { SandboxPaymentGuide } from '../src/components/SandboxPaymentGuide';
import { ApiError } from '../src/lib/api';
import { useAuth } from '../src/lib/auth';
import { buyParams, parseBuyLine } from '../src/lib/buy-now';
import {
  accountCartKey,
  dismissMergeNotice,
  mergeInto,
  useCart,
  useLinesQuote,
  useMergeNotice,
  usePhoneLines,
} from '../src/lib/cart';
import { checkoutKey, checkoutScope, closeCheckout, hasOpenCheckout } from '../src/lib/checkout-key';
import { count, formatRupiah, lineDetail } from '../src/lib/format';
import { orders, showOrder, useAddresses } from '../src/lib/orders';
import { useBottomSpace } from '../src/lib/use-bottom-space';
import { colors, mono } from '../src/theme';

type Param = string | string[] | undefined;

/**
 * Checkout, in one of two modes. The cart: everything in the account's cart, which the order empties. Buy now
 * (`?buy=<slug>&finish=<key>&qty=<n>`): that one part, priced on its own and ordered with `items`, leaving the cart
 * as it is and never waiting for it.
 */
export default function CheckoutScreen() {
  const params = useLocalSearchParams<{ buy?: Param; finish?: Param; qty?: Param }>();
  const buying = params.buy !== undefined;
  const requested = buying ? parseBuyLine(params) : null;
  const state = useAuth();
  const signedIn = state.status === 'signed-in';
  const cart = useCart();
  // just signed in from the cart: the parts put in the cart on this phone are joining the account's
  const phone = usePhoneLines();
  const notMerged = useMergeNotice(signedIn ? state.user.id : null);
  const quote = useLinesQuote(signedIn && requested ? [requested] : null);
  const addresses = useAddresses();
  const queryClient = useQueryClient();
  const navigation = useNavigation();
  // the title is right from the first frame, loading and error states included
  useLayoutEffect(
    () => navigation.setOptions({ title: buying ? 'Buy now' : 'Checkout' }),
    [navigation, buying],
  );
  const bottom = useBottomSpace(true);
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
    }, [setChosen]),
  );

  if (state.status === 'restoring') return <Loading />;
  if (state.status === 'signed-out') {
    return (
      <EmptyState
        message={
          buying ? 'Sign in to buy this part.' : 'Sign in to check out. Your cart moves to your account.'
        }
      >
        <Button
          label="Sign in"
          // replaced, not pushed: after sign-in the account screen opens a fresh checkout, and this one must not stay
          // underneath, where Back would lead to a second live checkout
          onPress={() =>
            router.replace({
              pathname: '/account',
              params: { next: 'checkout', ...(requested ? buyParams(requested) : {}) },
            })
          }
        />
      </EmptyState>
    );
  }
  if (buying && !requested) {
    return (
      <EmptyState message="This link does not name a part to buy.">
        <Button label="Browse parts" href="/products" />
      </EmptyState>
    );
  }
  const source = buying ? quote : cart.mode === 'account' ? cart.query : null;
  if (!source || source.isPending || addresses.isPending) return <Loading />;
  // a failed refetch keeps what is on screen; only a first load that failed has nothing to show
  if (!source.data || !addresses.data) {
    const message = (source.error ?? addresses.error)?.message ?? 'Something went wrong.';
    return (
      <EmptyState message={message}>
        <Button
          label="Try again"
          onPress={() => {
            void source.refetch();
            void addresses.refetch();
          }}
        />
      </EmptyState>
    );
  }

  const priced: Cart = source.data;
  const list = addresses.data;
  const address = list.find((a) => a.id === chosen) ?? list.find((a) => a.isDefault) ?? list[0];
  const { user } = state;
  const userId = user.id;
  // Buy now orders the line as the quote has it: the API swaps a finish the part no longer has for its first
  const quoted = buying ? priced.items[0] : undefined;
  const buyLine: CartLineInput | null = quoted
    ? { slug: quoted.product.slug, colorKey: quoted.colorKey, quantity: quoted.quantity }
    : requested;
  const scope = checkoutScope(buyLine);
  // an attempt that ended without a clear answer (no reply, or a server error): the order may exist
  const maybePlaced = hasOpenCheckout(userId, scope) && !busy;
  const empty = priced.items.length + priced.builds.length === 0;

  if (empty && !maybePlaced) {
    if (buying) {
      return (
        <EmptyState message="This part is no longer sold.">
          <Button label="Browse parts" href="/products" />
        </EmptyState>
      );
    }
    if (phone === 'none') return <EmptyCart />;
  }

  const place = async () => {
    if (!address) return;
    const key = checkoutKey(userId, scope, randomUUID);
    setBusy(true);
    setError(undefined);
    try {
      const order = await orders.place(address.id, key, buyLine ? [buyLine] : undefined);
      closeCheckout(key);
      await showOrder(queryClient, userId, order);
      if (!buying) {
        // what did not fit is old news once the cart is ordered
        dismissMergeNotice();
        // the API emptied the cart into the order; refreshed in the background, the order opens at once
        void queryClient.invalidateQueries({ queryKey: accountCartKey(userId) });
      }
      // the order screen opens the payment page as soon as it is in view, as the web's "Place order and pay"
      const target = { pathname: '/orders/[number]', params: { number: order.number, pay: '1' } } as const;
      // opened from here, the order takes this screen's place; with another screen on top, it opens over that one
      if (navigation.isFocused()) {
        allowLeave();
        router.replace(target);
      } else {
        router.push(target);
      }
    } catch (e) {
      // What is shown stays, so "Place order" stays available: if the order was placed but its reply was lost,
      // the same key brings back that order rather than placing a second one.
      setError(e instanceof Error ? e.message : 'Could not place the order. Try again.');
      if (e instanceof ApiError && e.status === 404) void addresses.refetch();
      // a refusal (4xx) placed nothing: the next attempt is a new order
      if (e instanceof ApiError && e.status >= 400 && e.status < 500) {
        closeCheckout(key);
        // e.g. a part withdrawn or short of stock since it was priced: the lines are redrawn as they now are
        void source.refetch();
      }
    } finally {
      setBusy(false);
    }
  };

  // after an unclear failure the cart may already have become the order: the same key then simply returns it
  // an order placed while the phone's parts are still on their way would leave them out
  const canPlace =
    ((!empty && priced.canCheckout) || maybePlaced) && !!address && !busy && (buying || phone !== 'joining');
  const shippingFee = address?.shippingFee ?? 0;

  return (
    <View style={styles.fill}>
      <Stack.Screen
        options={{ title: buying ? 'Buy now' : 'Checkout', headerBackVisible: !busy, gestureEnabled: !busy }}
      />
      <ScrollView contentContainerStyle={[styles.page, { paddingBottom: bottom }]}>
        {!empty && (
          <>
            <Text style={styles.label}>{buying ? 'Buying' : 'In this order'}</Text>
            <LineList lines={orderLines(priced)} />
          </>
        )}
        {quoted?.problem && (
          <Text style={styles.problem}>
            {quoted.problem === 'OUT_OF_STOCK'
              ? 'This part is out of stock.'
              : `Only ${quoted.product.stock} left: fewer than you asked for.`}
          </Text>
        )}
        {!buying && !empty && !priced.canCheckout && (
          <Text style={styles.problem}>
            Some lines in your cart cannot be bought as they stand. Fix them in the cart.
          </Text>
        )}

        {!buying && phone === 'joining' && (
          <Text style={styles.note} accessibilityLiveRegion="polite">
            Bringing the parts from this phone into your cart…
          </Text>
        )}
        {!buying && phone === 'failed' && (
          <View accessibilityLiveRegion="polite">
            <Text style={styles.problem}>The parts added on this phone have not reached your cart yet.</Text>
            <Button
              variant="ghost"
              label="Try again"
              onPress={() => void mergeInto(queryClient, userId).catch(() => undefined)}
            />
          </View>
        )}
        {!buying && notMerged > 0 && (
          <Text style={styles.note}>
            {count(notMerged, 'part')} from this phone did not fit in your cart: a cart holds up to{' '}
            {MAX_CART_LINES} different parts, {MAX_LINE_QUANTITY} of each.
          </Text>
        )}
        {maybePlaced && (
          <Text style={styles.note}>
            The order may have gone through. Placing it again opens that order instead of making a second one.
          </Text>
        )}

        <Text style={[styles.label, styles.section]}>Ship to</Text>
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
          <Button variant="secondary" label="Add an address" href="/addresses/new" disabled={busy} />
        ) : (
          <Text style={styles.note}>
            You have saved {MAX_ADDRESSES} addresses, the most an account keeps. Remove one on the website to
            add another.
          </Text>
        )}

        <View style={styles.summary}>
          <Row
            label={`Subtotal · ${count(priced.itemCount, 'item')}`}
            value={formatRupiah(priced.subtotal)}
          />
          <Row
            label={address ? `Shipping · ${address.shippingEta}` : 'Shipping'}
            value={address ? formatRupiah(address.shippingFee) : '—'}
          />
        </View>
        <Text style={styles.note}>
          Placing the order opens Midtrans&apos; payment page. Pay within {paymentWindowMinutes(user.isDemo)}{' '}
          minutes: the parts are held for you until then. Midtrans runs in sandbox here, so no real money
          moves.
        </Text>
        <SandboxPaymentGuide />
      </ScrollView>
      <BottomBar>
        {error && (
          <Text style={styles.problem} accessibilityLiveRegion="polite">
            {error}
          </Text>
        )}
        <View style={styles.bar}>
          <View style={styles.totals}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.total}>{formatRupiah(priced.subtotal + shippingFee)}</Text>
          </View>
          <Button
            label={busy ? 'Placing order…' : 'Place order'}
            onPress={() => void place()}
            disabled={!canPlace}
            busy={busy}
            style={styles.place}
          />
        </View>
      </BottomBar>
    </View>
  );
}

/** every line the order will hold: parts, then bikes, as the cart lists them */
function orderLines(priced: Cart): Line[] {
  return [
    ...priced.items.map((i) => ({
      key: `part:${i.product.slug}:${i.colorKey}`,
      art: (
        <PartImage slug={i.product.slug} module={i.product.module} colorKey={i.colorKey} style={lineArt} />
      ),
      name: i.product.name,
      detail: lineDetail(i.quantity, i.product.model, i.colorLabel),
      total: formatRupiah(i.lineTotal),
    })),
    ...priced.builds.map((b) => {
      const frame = b.quote.parts.find((p) => p.product.module === 'FRAME')?.product;
      return {
        key: `bike:${b.id}`,
        art: frame ? (
          <PartImage slug={frame.slug} module={frame.module} colorKey={b.quote.colorKey} style={lineArt} />
        ) : (
          <ArtPlaceholder label="Bike" style={lineArt} />
        ),
        name: b.quote.label,
        detail: lineDetail(b.quantity, count(b.quote.parts.length, 'part'), b.quote.colorLabel),
        total: formatRupiah(b.lineTotal),
      };
    }),
  ];
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
      style={({ pressed }) => [styles.address, selected && styles.addressSelected, pressed && styles.pressed]}
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
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
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  page: { padding: 16, gap: 12 },
  label: {
    fontFamily: mono,
    fontSize: 12,
    color: colors.ink3,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  section: { marginTop: 8 },
  addresses: { gap: 10 },
  address: { borderWidth: 1, borderColor: colors.bench, backgroundColor: colors.alu50, padding: 12, gap: 3 },
  addressSelected: { borderColor: colors.signal },
  pressed: { opacity: 0.85 },
  recipient: { fontSize: 15, fontWeight: '600', color: colors.ink },
  addressLine: { fontSize: 14, color: colors.ink2 },
  fee: { fontFamily: mono, fontSize: 12, color: colors.ink3, marginTop: 4 },
  summary: { borderTopWidth: 1, borderTopColor: colors.bench, paddingTop: 14, marginTop: 8, gap: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 },
  rowLabel: { fontSize: 14, color: colors.ink2, flexShrink: 1 },
  rowValue: { flexShrink: 0, fontFamily: mono, fontSize: 14, color: colors.ink },
  problem: { fontSize: 14, color: colors.danger },
  note: { fontSize: 13, color: colors.ink3, lineHeight: 19 },
  bar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 16, rowGap: 10 },
  totals: { flexGrow: 1, flexShrink: 1, minWidth: 0 },
  totalLabel: { fontSize: 13, color: colors.ink2 },
  total: { fontFamily: mono, fontSize: 18, fontWeight: '700', color: colors.ink },
  place: { flexGrow: 1, minWidth: 160 },
});
