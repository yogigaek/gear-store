import { MAX_CART_LINES, MAX_LINE_QUANTITY, productDetailSchema } from '@gear-store/shared';
import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PartImage, SpecPlate, StockNote } from '../../src/components/parts';
import { api, ApiError, retryTransient } from '../../src/lib/api';
import { useCartActions } from '../../src/lib/cart';
import { formatRupiah, keepUnits } from '../../src/lib/format';
import { colors, mono } from '../../src/theme';

export default function ProductScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const product = useQuery({
    queryKey: ['product', slug],
    queryFn: () => api(`/products/${encodeURIComponent(slug)}`, productDetailSchema),
    retry: retryTransient,
  });
  const [colorKey, setColorKey] = useState<string>();
  const [added, setAdded] = useState<string>();
  // taps stay live while one is on its way: each one queues and adds, so the label only says work is under way
  const [adding, setAdding] = useState(0);
  const { add } = useCartActions();

  if (product.isPending) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: '' }} />
        <ActivityIndicator color={colors.signal} />
      </View>
    );
  }

  // a failed refetch keeps the part on screen; only a first load that failed has nothing to show
  if (product.isError && !product.data) {
    const missing = product.error instanceof ApiError && product.error.status === 404;
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: '' }} />
        <Text style={styles.message}>{missing ? 'This part is no longer sold.' : product.error.message}</Text>
        {!missing && (
          <Pressable onPress={() => void product.refetch()} style={styles.retry} accessibilityRole="button">
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        )}
      </View>
    );
  }

  const p = product.data;
  const color = p.colors.find((c) => c.key === colorKey) ?? p.colors[0];
  const soldOut = p.stock === 0;

  const addToCart = async () => {
    setAdding((n) => n + 1);
    try {
      const result = await add(p.slug, color?.key ?? '', 1);
      setAdded(
        result === 'added'
          ? `Added${color ? ` in ${color.label}` : ''}. Open the cart from the top right.`
          : result === 'line-full'
            ? `Your cart already holds ${MAX_LINE_QUANTITY} of this part, the most per order.`
            : `A cart holds up to ${MAX_CART_LINES} different parts.`,
      );
    } catch (error) {
      setAdded(error instanceof Error ? error.message : 'Could not add it. Try again.');
    } finally {
      setAdding((n) => n - 1);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Stack.Screen options={{ title: p.model }} />
      <PartImage slug={p.slug} module={p.module} colorKey={color?.key} style={styles.art} />

      <View style={styles.section}>
        <Text style={styles.model}>{p.model}</Text>
        <Text style={styles.name} accessibilityRole="header">
          {p.name}
        </Text>
        <View style={styles.priceRow}>
          <Text style={styles.price}>{formatRupiah(p.price)}</Text>
          <StockNote stock={p.stock} />
        </View>
        <SpecPlate specs={p.plate} />
      </View>

      <View style={styles.section}>
        <Pressable
          onPress={addToCart}
          disabled={soldOut}
          style={[styles.add, soldOut && styles.addDisabled]}
          accessibilityRole="button"
          accessibilityState={{ disabled: soldOut }}
        >
          <Text style={[styles.addText, soldOut && styles.addTextDisabled]}>
            {soldOut ? 'Out of stock' : adding > 0 ? 'Adding…' : 'Add to cart'}
          </Text>
        </Pressable>
        {added && (
          <Text style={styles.added} accessibilityLiveRegion="polite">
            {added}
          </Text>
        )}
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
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  message: { color: colors.ink2, textAlign: 'center', fontSize: 15 },
  retry: { backgroundColor: colors.signal, paddingHorizontal: 20, paddingVertical: 12 },
  retryText: { color: '#15181a', fontWeight: '600' },
  page: { paddingBottom: 32 },
  art: { width: '100%', aspectRatio: 4 / 3, borderBottomWidth: 1, borderBottomColor: colors.bench },
  section: { paddingHorizontal: 16, paddingTop: 20, gap: 10 },
  model: { fontFamily: mono, fontSize: 12, color: colors.ink3, letterSpacing: 0.6 },
  name: { fontSize: 26, fontWeight: '800', color: colors.ink, textTransform: 'uppercase', lineHeight: 30 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  price: { fontFamily: mono, fontSize: 20, fontWeight: '600', color: colors.ink },
  add: { backgroundColor: colors.signal, paddingVertical: 14, alignItems: 'center' },
  addDisabled: { backgroundColor: colors.alu50, borderWidth: 1, borderColor: colors.bench },
  addText: { color: '#15181a', fontSize: 15, fontWeight: '700' },
  addTextDisabled: { color: colors.ink3 },
  added: { fontSize: 13, color: colors.ok },
  label: {
    fontFamily: mono,
    fontSize: 12,
    color: colors.ink3,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  swatchRing: { padding: 3, borderWidth: 2, borderColor: 'transparent', borderRadius: 999 },
  swatchSelected: { borderColor: colors.signal },
  swatch: { width: 32, height: 32, borderRadius: 999, borderWidth: 1, borderColor: colors.benchStrong },
  description: { fontSize: 15, lineHeight: 23, color: colors.ink2 },
  specs: { borderWidth: 1, borderColor: colors.bench },
  specRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 16, padding: 10 },
  specDivider: { borderTopWidth: 1, borderTopColor: colors.bench },
  specLabel: { fontSize: 14, color: colors.ink3, flexShrink: 1 },
  specValue: { fontFamily: mono, fontSize: 13, fontWeight: '600', color: colors.ink, textAlign: 'right' },
});
