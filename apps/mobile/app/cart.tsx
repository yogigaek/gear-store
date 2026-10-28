import { MAX_CART_LINES, MAX_LINE_QUANTITY, type CartBuild, type CartLine } from '@gear-store/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { BottomBar } from '../src/components/BottomBar';
import { Button } from '../src/components/Button';
import { EmptyCart, EmptyState } from '../src/components/EmptyState';
import { Loading } from '../src/components/Loading';
import { ArtPlaceholder, PartImage } from '../src/components/parts';
import { useAuth } from '../src/lib/auth';
import {
  dismissMergeNotice,
  mergeInto,
  useCart,
  useCartActions,
  useMergeNotice,
  usePhoneLines,
} from '../src/lib/cart';
import { count, formatRupiah } from '../src/lib/format';
import { useBottomSpace } from '../src/lib/use-bottom-space';
import { usePullRefresh } from '../src/lib/use-pull-refresh';
import { colors, mono } from '../src/theme';

const lineProblem: Record<NonNullable<CartLine['problem']>, (line: CartLine) => string> = {
  OUT_OF_STOCK: () => 'Out of stock. Remove it to check out.',
  // short on its own, or only together with a bike in the cart that uses the same part (as on the web)
  NOT_ENOUGH_STOCK: (line) =>
    line.quantity > line.product.stock
      ? `Only ${line.product.stock} left. Lower the quantity to check out.`
      : `Only ${line.product.stock} left, and a bike in your cart uses it too. Lower one of them to check out.`,
};

/** the reason a bike in the cart cannot be bought as it stands, in the server's words */
function buildProblem(build: CartBuild): string | null {
  if (!build.problem) return null;
  const reason = build.quote.problems[0]?.message ?? '';
  return build.problem === 'CANNOT_BUILD'
    ? `${reason} Remove this bike and build it again.`
    : `${reason} Lower the quantity to check out.`;
}

type Row = { kind: 'part'; line: CartLine } | { kind: 'bike'; build: CartBuild };

export default function CartScreen() {
  const cart = useCart();
  const auth = useAuth();
  const userId = auth.status === 'signed-in' ? auth.user.id : null;
  const notMerged = useMergeNotice(userId);
  // just signed in: the parts put in the cart on this phone are joining the account's, as checkout says too
  const phone = usePhoneLines();
  const queryClient = useQueryClient();
  const bottom = useBottomSpace(true);
  const pull = usePullRefresh(() => (cart.mode === 'account' ? cart.query.refetch() : Promise.resolve()));
  const retryMerge = () => {
    if (userId) void mergeInto(queryClient, userId).catch(() => undefined);
  };

  if (cart.mode === 'restoring' || (cart.mode === 'account' && cart.query.isPending)) return <Loading />;
  if (cart.mode === 'guest' && cart.lineCount === 0) return <EmptyCart />;
  if (cart.query.isPending) return <Loading />;
  // a failed refetch keeps the cart it already has on screen, with the error above it (as on the web)
  if (cart.query.isError && !cart.query.data) {
    return (
      <EmptyState message={cart.query.error.message}>
        <Button label="Try again" onPress={() => void cart.query.refetch()} />
      </EmptyState>
    );
  }

  const priced = cart.query.data;
  if (!priced) return <Loading />;
  const rows: Row[] = [
    ...priced.items.map((line) => ({ kind: 'part' as const, line })),
    ...priced.builds.map((build) => ({ kind: 'bike' as const, build })),
  ];
  const remote = cart.mode === 'account';
  if (rows.length === 0) {
    // not "Your cart is empty" for the moment the phone's parts are on their way in
    if (remote && phone === 'joining') {
      return (
        <EmptyState message="Bringing the parts from this phone into your cart…">
          <ActivityIndicator color={colors.signal} />
        </EmptyState>
      );
    }
    if (remote && phone === 'failed') {
      return (
        <EmptyState message="The parts added on this phone have not reached your cart yet.">
          <Button label="Try again" onPress={retryMerge} />
        </EmptyState>
      );
    }
    return <EmptyCart />;
  }
  // a guest's lines are priced again after each change; the last prices stay on screen until the new ones come
  const updating = cart.mode === 'guest' && cart.query.isPlaceholderData;

  return (
    <View style={styles.fill}>
      <FlatList
        data={rows}
        keyExtractor={(row) =>
          row.kind === 'part' ? `part:${row.line.product.slug}:${row.line.colorKey}` : `bike:${row.build.id}`
        }
        contentContainerStyle={[styles.list, { paddingBottom: bottom }]}
        ListHeaderComponent={
          <>
            {cart.query.isError && <Text style={styles.banner}>{cart.query.error.message}</Text>}
            {remote && phone === 'joining' && (
              <Text style={styles.joining} accessibilityLiveRegion="polite">
                Bringing the parts from this phone into your cart…
              </Text>
            )}
            {remote && phone === 'failed' && (
              <View style={styles.joinFailed} accessibilityLiveRegion="polite">
                <Text style={styles.problem}>
                  The parts added on this phone have not reached your cart yet.
                </Text>
                <Button variant="ghost" label="Try again" onPress={retryMerge} />
              </View>
            )}
            {notMerged > 0 && (
              <View style={styles.notice} accessibilityLiveRegion="polite">
                <Text style={styles.noticeText}>
                  {count(notMerged, 'part')} from this phone did not fit in your cart: a cart holds up to{' '}
                  {MAX_CART_LINES} different parts, {MAX_LINE_QUANTITY} of each.
                </Text>
                <Button variant="ghost" label="Dismiss" onPress={dismissMergeNotice} />
              </View>
            )}
          </>
        }
        ItemSeparatorComponent={() => <View style={styles.gap} />}
        renderItem={({ item }) =>
          item.kind === 'part' ? (
            <PartRow line={item.line} remote={remote} />
          ) : (
            <BikeRow build={item.build} remote={remote} />
          )
        }
        refreshControl={
          remote ? (
            <RefreshControl
              {...pull}
              tintColor={colors.signal}
              colors={[colors.signal]}
              progressBackgroundColor={colors.alu50}
            />
          ) : undefined
        }
        ListFooterComponent={
          <Text style={styles.note}>
            {priced.canCheckout
              ? 'Shipping is added at checkout.'
              : 'Fix the lines marked above before checking out.'}
          </Text>
        }
      />
      <BottomBar>
        <View style={styles.bar}>
          <View style={styles.totals}>
            <Text style={styles.totalLabel} accessibilityLiveRegion="polite">
              Subtotal · {count(priced.itemCount, 'item')}
              {updating ? ' · updating…' : ''}
            </Text>
            <Text style={styles.total}>{formatRupiah(priced.subtotal)}</Text>
          </View>
          <Button
            label={cart.mode === 'account' ? 'Check out' : 'Sign in to check out'}
            href={
              cart.mode === 'account' ? '/checkout' : { pathname: '/account', params: { next: 'checkout' } }
            }
            disabled={!priced.canCheckout}
            style={styles.checkout}
          />
        </View>
      </BottomBar>
    </View>
  );
}

/**
 * Runs a cart change and keeps its failure on the row it came from. `pending` counts the changes queued or on
 * their way for the row (an account's changes go to the server one at a time), so taps stay live and the row says
 * it is still updating.
 */
function useRowAction() {
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(0);
  const run = (change: Promise<unknown>) => {
    setError(undefined);
    setPending((n) => n + 1);
    change
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : 'Could not update the cart. Try again.'),
      )
      .finally(() => setPending((n) => n - 1));
  };
  return { error, pending: pending > 0, run };
}

function PartRow({ line, remote }: { line: CartLine; remote: boolean }) {
  const { product, colorKey, quantity } = line;
  const actions = useCartActions();
  const { error, pending, run } = useRowAction();
  return (
    <Card
      art={
        <PartImage
          slug={product.slug}
          module={product.module}
          colorKey={colorKey}
          fit="contain"
          style={styles.art}
        />
      }
    >
      <Link href={{ pathname: '/products/[slug]', params: { slug: product.slug } }} asChild>
        <Pressable style={styles.nameLink} accessibilityRole="link">
          <Text style={styles.name}>{product.name}</Text>
        </Pressable>
      </Link>
      {line.colorLabel && <Text style={styles.finish}>{line.colorLabel}</Text>}
      {line.problem && <Text style={styles.problem}>{lineProblem[line.problem](line)}</Text>}
      <Controls
        name={product.name}
        quantity={quantity}
        total={line.lineTotal}
        busy={remote && pending}
        onStep={(delta) => run(actions.adjust(product.slug, colorKey, delta))}
      />
      <Button
        variant="ghost"
        label="Remove"
        onPress={() => run(actions.remove(product.slug, colorKey))}
        accessibilityLabel={`Remove ${product.name}`}
      />
      {error && <Text style={styles.problem}>{error}</Text>}
    </Card>
  );
}

function BikeRow({ build, remote }: { build: CartBuild; remote: boolean }) {
  const actions = useCartActions();
  const { error, pending, run } = useRowAction();
  const problem = buildProblem(build);
  const frame = build.quote.parts.find((p) => p.product.module === 'FRAME')?.product;
  return (
    <Card
      art={
        frame ? (
          <PartImage
            slug={frame.slug}
            module={frame.module}
            colorKey={build.quote.colorKey}
            fit="contain"
            style={styles.art}
          />
        ) : (
          <ArtPlaceholder label="Bike" style={styles.art} />
        )
      }
    >
      <Text style={styles.name}>{build.quote.label}</Text>
      {build.quote.colorLabel && <Text style={styles.finish}>{build.quote.colorLabel}</Text>}
      <Text style={styles.finish}>{count(build.quote.parts.length, 'part')} · built on the web</Text>
      {problem && <Text style={styles.problem}>{problem}</Text>}
      <Controls
        name={build.quote.label}
        quantity={build.quantity}
        total={build.lineTotal}
        busy={remote && pending}
        onStep={(delta) => run(actions.adjustBuild(build.id, delta))}
      />
      <Button
        variant="ghost"
        label="Remove"
        onPress={() => run(actions.removeBuild(build.id))}
        accessibilityLabel={`Remove ${build.quote.label}`}
      />
      {error && <Text style={styles.problem}>{error}</Text>}
    </Card>
  );
}

function Card({ art, children }: { art: ReactNode; children: ReactNode }) {
  return (
    <View style={styles.row}>
      {art}
      <View style={styles.body}>{children}</View>
    </View>
  );
}

function Controls({
  name,
  quantity,
  total,
  busy,
  onStep,
}: {
  name: string;
  quantity: number;
  total: number;
  /** a change to this row is queued or on its way */
  busy: boolean;
  onStep: (delta: number) => void;
}) {
  const atMax = quantity >= MAX_LINE_QUANTITY;
  return (
    <View style={styles.controls}>
      <View style={[styles.stepper, busy && styles.stepperBusy]} accessibilityState={{ busy }}>
        <Pressable
          onPress={() => onStep(-1)}
          style={({ pressed }) => [styles.step, pressed && styles.stepPressed]}
          accessibilityRole="button"
          accessibilityLabel={quantity === 1 ? `Remove ${name}` : `One fewer ${name}`}
        >
          <Text style={styles.stepText}>−</Text>
        </Pressable>
        <Text style={styles.quantity} accessibilityLabel={`Quantity ${quantity}`}>
          {quantity}
        </Text>
        <Pressable
          onPress={() => onStep(1)}
          disabled={atMax}
          style={({ pressed }) => [styles.step, pressed && styles.stepPressed]}
          accessibilityRole="button"
          accessibilityState={{ disabled: atMax }}
          accessibilityLabel={`One more ${name}`}
        >
          <Text style={[styles.stepText, atMax && styles.stepDisabled]}>+</Text>
        </Pressable>
      </View>
      <View style={styles.totalBox}>
        {busy && <ActivityIndicator size="small" color={colors.ink3} accessibilityLabel="Updating" />}
        <Text style={styles.lineTotal}>{formatRupiah(total)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  list: { padding: 16 },
  gap: { height: 12 },
  row: { flexDirection: 'row', borderWidth: 1, borderColor: colors.bench, backgroundColor: colors.alu50 },
  // as tall as the card: the whole still sits in it on its own ground, so nothing of the part is cut off
  art: { width: 104, minHeight: 104, alignSelf: 'stretch' },
  body: {
    flex: 1,
    minWidth: 0,
    padding: 12,
    paddingBottom: 4,
    gap: 6,
    borderLeftWidth: 1,
    borderLeftColor: colors.bench,
  },
  nameLink: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  name: { fontSize: 15, fontWeight: '600', color: colors.ink },
  finish: { fontFamily: mono, fontSize: 11, color: colors.ink3 },
  problem: { fontSize: 13, color: colors.danger },
  // at 360 pt or a large text size the line total drops under the stepper rather than past the card's edge
  controls: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: 12,
    rowGap: 6,
    marginTop: 4,
  },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.benchStrong },
  stepperBusy: { opacity: 0.5 },
  step: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  stepPressed: { backgroundColor: colors.bench },
  stepText: { fontSize: 18, color: colors.ink },
  stepDisabled: { color: colors.benchStrong },
  quantity: { fontFamily: mono, fontSize: 14, color: colors.ink, minWidth: 28, textAlign: 'center' },
  totalBox: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lineTotal: { flexShrink: 0, fontFamily: mono, fontSize: 14, fontWeight: '600', color: colors.ink },
  note: { fontSize: 13, color: colors.ink3, marginTop: 16 },
  banner: { fontSize: 13, color: colors.danger, marginBottom: 12 },
  joining: { fontSize: 13, color: colors.ink3, lineHeight: 19, marginBottom: 12 },
  joinFailed: { marginBottom: 8 },
  notice: {
    borderWidth: 1,
    borderColor: colors.signal,
    padding: 12,
    paddingBottom: 4,
    gap: 4,
    marginBottom: 12,
  },
  noticeText: { fontSize: 13, color: colors.ink2, lineHeight: 19 },
  bar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 16, rowGap: 10 },
  totals: { flexGrow: 1, flexShrink: 1, minWidth: 0 },
  totalLabel: { fontSize: 13, color: colors.ink2 },
  total: { fontFamily: mono, fontSize: 18, fontWeight: '700', color: colors.ink },
  checkout: { flexGrow: 1, minWidth: 160 },
});
