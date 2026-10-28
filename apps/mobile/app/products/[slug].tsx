import { MAX_CART_LINES, MAX_LINE_QUANTITY, productDetailSchema } from '@gear-store/shared';
import { useQuery } from '@tanstack/react-query';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { BottomBar } from '../../src/components/BottomBar';
import { Button } from '../../src/components/Button';
import { EmptyState } from '../../src/components/EmptyState';
import { Loading } from '../../src/components/Loading';
import { PartImage, SpecPlate, StockNote } from '../../src/components/parts';
import { api, ApiError, retryTransient } from '../../src/lib/api';
import { useAuth } from '../../src/lib/auth';
import { buyParams } from '../../src/lib/buy-now';
import { useCartActions, type AddResult } from '../../src/lib/cart';
import { useCategories } from '../../src/lib/catalog';
import { formatRupiah, keepUnits } from '../../src/lib/format';
import { useBottomSpace } from '../../src/lib/use-bottom-space';
import { colors, mono } from '../../src/theme';

type Said = { ok: true; finish?: string } | { ok: false; text: string };

export default function ProductScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const product = useQuery({
    queryKey: ['product', slug],
    queryFn: () => api(`/products/${encodeURIComponent(slug)}`, productDetailSchema),
    retry: retryTransient,
  });
  const categories = useCategories();
  const [colorKey, setColorKey] = useState<string>();
  const [said, setSaid] = useState<Said>();
  // taps stay live while one is on its way: each one queues and adds, so the label only says work is under way
  const [adding, setAdding] = useState(0);
  // a second tap before the screen changes would open checkout twice
  const leaving = useRef(false);
  useFocusEffect(
    useCallback(() => {
      leaving.current = false;
      // "Added to cart" is about this visit: back from the cart or checkout, it would read as a second add
      return () => setSaid(undefined);
    }, []),
  );
  const { add } = useCartActions();
  const signedIn = useAuth().status === 'signed-in';
  const bottom = useBottomSpace(true);
  // sized from the screen: a percentage width let iOS draw a photo at its own size
  const { width } = useWindowDimensions();

  if (product.isPending) return <Loading />;

  // a failed refetch keeps the part on screen; only a first load that failed has nothing to show
  if (product.isError && !product.data) {
    // a 400 is a malformed slug (a broken link): there is no such part either
    const missing =
      product.error instanceof ApiError && (product.error.status === 404 || product.error.status === 400);
    return missing ? (
      <EmptyState message="This part is no longer sold.">
        <Button label="Browse parts" href="/products" />
      </EmptyState>
    ) : (
      <EmptyState message={product.error.message}>
        <Button label="Try again" onPress={() => void product.refetch()} />
      </EmptyState>
    );
  }

  const p = product.data;
  const color = p.colors.find((c) => c.key === colorKey) ?? p.colors[0];
  const soldOut = p.stock === 0;
  const category = categories.data?.find((c) => c.slug === p.category)?.name ?? '';

  const refused = (result: Exclude<AddResult, 'added'>): Said => ({
    ok: false,
    text:
      result === 'line-full'
        ? `Your cart already holds ${MAX_LINE_QUANTITY} of this part, the most per order.`
        : `A cart holds up to ${MAX_CART_LINES} different parts.`,
  });

  const addToCart = async () => {
    setAdding((n) => n + 1);
    try {
      const result = await add(p.slug, color?.key ?? '', 1);
      setSaid(result === 'added' ? { ok: true, finish: color?.label } : refused(result));
    } catch (error) {
      setSaid({ ok: false, text: error instanceof Error ? error.message : 'Could not add it. Try again.' });
    }
    setAdding((n) => n - 1);
  };

  // Buy now orders this one part on its own (POST /me/orders with `items`): the cart is not touched
  const buyNow = () => {
    if (leaving.current) return;
    leaving.current = true;
    const line = buyParams({ slug: p.slug, colorKey: color?.key ?? '', quantity: 1 });
    if (signedIn) router.push({ pathname: '/checkout', params: line });
    else router.push({ pathname: '/account', params: { next: 'checkout', ...line } });
  };

  return (
    <View style={styles.fill}>
      <Stack.Screen options={{ title: category }} />
      <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, { paddingBottom: bottom }]}>
        <PartImage
          slug={p.slug}
          module={p.module}
          colorKey={color?.key}
          style={[styles.art, { width, height: width * 0.75 }]}
        />

        <View style={styles.section}>
          <Text style={styles.model}>{p.model}</Text>
          <Text style={styles.name} accessibilityRole="header" maxFontSizeMultiplier={1.4}>
            {p.name}
          </Text>
          <View style={styles.priceRow}>
            <Text style={styles.price}>{formatRupiah(p.price)}</Text>
            <StockNote stock={p.stock} />
          </View>
          <SpecPlate specs={p.plate} />
        </View>

        {p.colors.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.label}>Finish · {color?.label}</Text>
            <View style={styles.swatches} accessibilityRole="radiogroup">
              {p.colors.map((c) => {
                const selected = c.key === color?.key;
                return (
                  <Pressable
                    key={c.key}
                    onPress={() => setColorKey(c.key)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    accessibilityLabel={c.label}
                    style={[styles.swatchRing, selected && styles.swatchSelected]}
                  >
                    <View style={[styles.swatch, { backgroundColor: c.hex }]} />
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.description}>{p.description}</Text>
        </View>

        {p.specs.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.label}>Specifications</Text>
            <View style={styles.specs}>
              {p.specs.map((s, i) => (
                <View key={s.label} style={[styles.specRow, i > 0 && styles.specDivider]}>
                  <Text style={styles.specLabel}>{s.label}</Text>
                  <Text style={styles.specValue}>{keepUnits(s.value)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      <BottomBar>
        {said &&
          (said.ok ? (
            <View style={styles.added} accessibilityLiveRegion="polite">
              <Text style={styles.addedText}>Added to cart{said.finish ? ` · ${said.finish}` : ''}</Text>
              <Button variant="ghost" label="View cart" href="/cart" style={styles.viewCart} />
            </View>
          ) : (
            <Text style={styles.addFailed} accessibilityLiveRegion="polite">
              {said.text}
            </Text>
          ))}
        {soldOut ? (
          <Button label="Out of stock" disabled />
        ) : (
          <View style={styles.actions}>
            <Button
              label={adding > 0 ? 'Adding…' : 'Add to cart'}
              onPress={() => void addToCart()}
              busy={adding > 0}
              style={styles.action}
            />
            <Button
              variant="secondary"
              label="Buy now"
              onPress={buyNow}
              accessibilityHint={
                signedIn ? 'Opens checkout for this part alone' : 'Asks you to sign in, then opens checkout'
              }
              style={styles.action}
            />
          </View>
        )}
      </BottomBar>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  // the still's ground behind the content, so pulling past the top shows no band above the still
  scroll: { backgroundColor: colors.still },
  content: { flexGrow: 1, backgroundColor: colors.alu },
  art: { borderBottomWidth: 1, borderBottomColor: colors.bench },
  section: { paddingHorizontal: 16, paddingTop: 20, gap: 10 },
  model: { fontFamily: mono, fontSize: 12, color: colors.ink3, letterSpacing: 0.6 },
  name: { fontSize: 26, fontWeight: '800', color: colors.ink, textTransform: 'uppercase', lineHeight: 30 },
  priceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    columnGap: 12,
  },
  price: { fontFamily: mono, fontSize: 20, fontWeight: '600', color: colors.ink },
  label: {
    fontFamily: mono,
    fontSize: 12,
    color: colors.ink3,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  // 34 + 2 × (3 padding + 2 ring) = 44: the tap target
  swatchRing: { padding: 3, borderWidth: 2, borderColor: 'transparent', borderRadius: 999 },
  swatchSelected: { borderColor: colors.signal },
  swatch: { width: 34, height: 34, borderRadius: 999, borderWidth: 1, borderColor: colors.benchStrong },
  description: { fontSize: 15, lineHeight: 23, color: colors.ink2 },
  specs: { borderWidth: 1, borderColor: colors.bench },
  specRow: { flexDirection: 'row', gap: 16, padding: 10 },
  specDivider: { borderTopWidth: 1, borderTopColor: colors.bench },
  // the value takes the wider share and wraps, so a long one never squeezes the label into a column of letters
  specLabel: { flex: 2, fontSize: 14, color: colors.ink3 },
  specValue: {
    flex: 3,
    flexShrink: 1,
    fontFamily: mono,
    fontSize: 13,
    fontWeight: '600',
    color: colors.ink,
    textAlign: 'right',
  },
  added: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 12 },
  addedText: { flexShrink: 1, fontSize: 14, color: colors.ok },
  viewCart: { alignSelf: 'center' },
  addFailed: { fontSize: 14, color: colors.danger },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  // 2 × 130 + the gap fits beside each other in a 320-point screen's bar (288 points)
  action: { flexGrow: 1, flexBasis: 130 },
});
