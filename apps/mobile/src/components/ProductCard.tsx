import type { ProductSummary } from '@gear-store/shared';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatRupiah } from '../lib/format';
import { colors, mono } from '../theme';
import { PartImage, SpecPlate, StockNote } from './parts';

/** Mirrors the web card: still and name side by side, then the spec plate and the price across the card. */
export function ProductCard({ product }: { product: ProductSummary }) {
  return (
    // not a Link with asChild: its Slot merges the child's style as an object, so a pressed-state style would be lost
    <Pressable
      onPress={() => router.push({ pathname: '/products/[slug]', params: { slug: product.slug } })}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      accessibilityRole="link"
      accessibilityLabel={`${product.name}, ${formatRupiah(product.price)}`}
    >
      <View style={styles.top}>
        <PartImage slug={product.slug} module={product.module} style={styles.art} />
        <View style={styles.heading}>
          <View style={styles.meta}>
            <Text style={styles.model}>{product.model}</Text>
            <StockNote stock={product.stock} />
          </View>
          <Text style={styles.name}>{product.name}</Text>
        </View>
      </View>
      <SpecPlate specs={product.plate} style={styles.plate} />
      <Text style={styles.price}>{formatRupiah(product.price)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: colors.bench, backgroundColor: colors.alu50 },
  pressed: { borderColor: colors.ink },
  top: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.bench },
  art: { width: 112, aspectRatio: 1, borderRightWidth: 1, borderRightColor: colors.bench },
  heading: { flex: 1, minWidth: 0, padding: 12, justifyContent: 'center', gap: 8 },
  meta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 },
  model: { fontFamily: mono, fontSize: 11, color: colors.ink3, letterSpacing: 0.6, flexShrink: 1 },
  name: { fontSize: 16, fontWeight: '600', color: colors.ink, lineHeight: 21 },
  plate: { margin: 12, marginBottom: 0 },
  price: { fontFamily: mono, fontSize: 15, fontWeight: '600', color: colors.ink, padding: 12 },
});
