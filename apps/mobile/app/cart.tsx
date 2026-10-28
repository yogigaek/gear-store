import { MAX_CART_LINES, MAX_LINE_QUANTITY, type CartBuild, type CartLine } from '@gear-store/shared';
import { Link } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { PartImage } from '../src/components/parts';
import { useAuth } from '../src/lib/auth';
import { dismissMergeNotice, useCart, useCartActions, useMergeNotice } from '../src/lib/cart';
import { count, formatRupiah } from '../src/lib/format';
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
  const notMerged = useMergeNotice(auth.status === 'signed-in' ? auth.user.id : null);

  if (cart.mode === 'restoring' || (cart.mode === 'account' && cart.query.isPending)) return <Loading />;
  if (cart.mode === 'guest' && cart.lineCount === 0) return <Empty />;
  if (cart.query.isPending) return <Loading />;
  // a failed refetch keeps the cart it already has on screen, with the error above it (as on the web)
  if (cart.query.isError && !cart.query.data) {
    return (
      <View style={styles.center}>
        <Text style={styles.message}>{cart.query.error.message}</Text>
        <Pressable
          onPress={() => void cart.query.refetch()}
          style={styles.primary}
          accessibilityRole="button"
        >
          <Text style={styles.primaryText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  const priced = cart.query.data;
  if (!priced) return <Loading />;
  const rows: Row[] = [
    ...priced.items.map((line) => ({ kind: 'part' as const, line })),
    ...priced.builds.map((build) => ({ kind: 'bike' as const, build })),
  ];
  if (rows.length === 0) return <Empty />;

  return (
    <FlatList
      data={rows}
      keyExtractor={(row) =>
        row.kind === 'part' ? `part:${row.line.product.slug}:${row.line.colorKey}` : `bike:${row.build.id}`
      }
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        <>
          {cart.query.isError && <Text style={styles.banner}>{cart.query.error.message}</Text>}
          {notMerged > 0 && (
            <View style={styles.notice} accessibilityLiveRegion="polite">
              <Text style={styles.noticeText}>
                {count(notMerged, 'part')} from this phone did not fit in your cart: a cart holds up to{' '}
                {MAX_CART_LINES} different parts, {MAX_LINE_QUANTITY} of each.
              </Text>
              <Pressable onPress={dismissMergeNotice} hitSlop={8} accessibilityRole="button">
                <Text style={styles.dismiss}>Dismiss</Text>
              </Pressable>
            </View>
          )}
        </>
      }
      ItemSeparatorComponent={() => <View style={styles.gap} />}
      renderItem={({ item }) =>
        item.kind === 'part' ? <PartRow line={item.line} /> : <BikeRow build={item.build} />
      }
      ListFooterComponent={
        <View style={styles.summary}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal · {count(priced.itemCount, 'item')}</Text>
            <Text style={styles.total}>{formatRupiah(priced.subtotal)}</Text>
          </View>
          <Text style={styles.note}>
            {priced.canCheckout
              ? 'Shipping is added at checkout.'
              : 'Fix the lines marked above before checking out.'}
          </Text>
          {priced.canCheckout && (
            <Link
              href={
                cart.mode === 'account' ? '/checkout' : { pathname: '/account', params: { next: 'checkout' } }
              }
              asChild
            >
              <Pressable style={styles.checkout} accessibilityRole="link">
                <Text style={styles.primaryText}>
                  {cart.mode === 'account' ? 'Check out' : 'Sign in to check out'}
                </Text>
              </Pressable>
            </Link>
          )}
        </View>
      }
    />
  );
}

function Loading() {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.signal} />
    </View>
  );
}

function Empty() {
  return (
    <View style={styles.center}>
      <Text style={styles.message}>Your cart is empty.</Text>
      <Link href="/products" asChild>
        <Pressable style={styles.primary} accessibilityRole="link">
          <Text style={styles.primaryText}>Browse parts</Text>
        </Pressable>
      </Link>
    </View>
  );
}

/** runs a cart change and keeps its failure on the row it came from */
function useRowAction() {
  const [error, setError] = useState<string>();
  const run = (change: Promise<unknown>) => {
    setError(undefined);
    change.catch((e: unknown) =>
      setError(e instanceof Error ? e.message : 'Could not update the cart. Try again.'),
    );
  };
  return { error, run };
}

function PartRow({ line }: { line: CartLine }) {
  const { product, colorKey, quantity } = line;
  const actions = useCartActions();
  const { error, run } = useRowAction();
  return (
    <Card
      art={<PartImage slug={product.slug} module={product.module} colorKey={colorKey} style={styles.art} />}
    >
      <Text style={styles.name}>{product.name}</Text>
      {line.colorLabel && <Text style={styles.finish}>{line.colorLabel}</Text>}
      {line.problem && <Text style={styles.problem}>{lineProblem[line.problem](line)}</Text>}
      <Controls
        name={product.name}
        quantity={quantity}
        total={line.lineTotal}
        onStep={(delta) => run(actions.adjust(product.slug, colorKey, delta))}
      />
      <Pressable
        onPress={() => run(actions.remove(product.slug, colorKey))}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`Remove ${product.name}`}
      >
        <Text style={styles.remove}>Remove</Text>
      </Pressable>
      {error && <Text style={styles.problem}>{error}</Text>}
    </Card>
  );
}

function BikeRow({ build }: { build: CartBuild }) {
  const actions = useCartActions();
  const { error, run } = useRowAction();
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
            style={styles.art}
          />
        ) : undefined
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
        onStep={(delta) => run(actions.adjustBuild(build.id, delta))}
      />
      <Pressable
        onPress={() => run(actions.removeBuild(build.id))}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`Remove ${build.quote.label}`}
      >
        <Text style={styles.remove}>Remove</Text>
      </Pressable>
      {error && <Text style={styles.problem}>{error}</Text>}
    </Card>
  );
}

function Card({ art, children }: { art?: ReactNode; children: ReactNode }) {
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
  onStep,
}: {
  name: string;
  quantity: number;
  total: number;
  onStep: (delta: number) => void;
}) {
  const atMax = quantity >= MAX_LINE_QUANTITY;
  return (
    <View style={styles.controls}>
      <View style={styles.stepper}>
        <Pressable
          onPress={() => onStep(-1)}
          style={styles.step}
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
          style={[styles.step, atMax && styles.disabled]}
          accessibilityRole="button"
          accessibilityState={{ disabled: atMax }}
          accessibilityLabel={`One more ${name}`}
        >
          <Text style={styles.stepText}>+</Text>
        </Pressable>
      </View>
      <Text style={styles.lineTotal}>{formatRupiah(total)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  message: { color: colors.ink2, textAlign: 'center', fontSize: 15 },
  primary: { backgroundColor: colors.signal, paddingHorizontal: 20, paddingVertical: 12 },
  primaryText: { color: '#15181a', fontWeight: '600' },
  list: { padding: 16 },
  gap: { height: 12 },
  row: { flexDirection: 'row', borderWidth: 1, borderColor: colors.bench, backgroundColor: colors.alu50 },
  art: { width: 96, aspectRatio: 1, borderRightWidth: 1, borderRightColor: colors.bench },
  body: { flex: 1, minWidth: 0, padding: 12, gap: 6 },
  name: { fontSize: 15, fontWeight: '600', color: colors.ink },
  finish: { fontFamily: mono, fontSize: 11, color: colors.ink3 },
  problem: { fontSize: 13, color: colors.danger },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.benchStrong },
  step: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 18, color: colors.ink },
  disabled: { opacity: 0.35 },
  quantity: { fontFamily: mono, fontSize: 14, color: colors.ink, minWidth: 28, textAlign: 'center' },
  lineTotal: { fontFamily: mono, fontSize: 14, fontWeight: '600', color: colors.ink },
  remove: { fontSize: 13, color: colors.ink3, textDecorationLine: 'underline', marginTop: 4 },
  summary: { marginTop: 20, gap: 8, borderTopWidth: 1, borderTopColor: colors.bench, paddingTop: 16 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  totalLabel: { fontSize: 14, color: colors.ink2, flexShrink: 1 },
  total: { fontFamily: mono, fontSize: 18, fontWeight: '700', color: colors.ink },
  note: { fontSize: 13, color: colors.ink3 },
  banner: { fontSize: 13, color: colors.danger, marginBottom: 12 },
  notice: {
    borderWidth: 1,
    borderColor: colors.signal,
    padding: 12,
    gap: 8,
    marginBottom: 12,
    alignItems: 'flex-start',
  },
  noticeText: { fontSize: 13, color: colors.ink2, lineHeight: 19 },
  dismiss: { fontFamily: mono, fontSize: 12, color: colors.signal, textDecorationLine: 'underline' },
  checkout: { backgroundColor: colors.signal, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
});
