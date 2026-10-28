import type { PartModule, Spec } from '@gear-store/shared';
import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { keepUnits } from '../lib/format';
import { partStill } from '../lib/part-stills';
import { colors, mono } from '../theme';

const moduleNames: Record<PartModule, string> = {
  FRAME: 'Frame',
  BATTERY: 'Battery',
  SHOCK: 'Shock',
  FORK: 'Fork',
  WHEELSET: 'Wheelset',
  DRIVETRAIN: 'Drivetrain',
  COCKPIT: 'Cockpit',
  SEAT: 'Seatpost',
  ACCESSORY: 'Accessory',
};

/** A part's studio still; while a part has none, its module name, as on the web. */
export function PartImage({
  slug,
  module,
  colorKey,
  style,
}: {
  slug: string;
  module: PartModule;
  colorKey?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const still = partStill(slug, colorKey);
  return (
    <View style={[styles.art, style]}>
      {still ? (
        <Image source={still} style={styles.image} resizeMode="cover" accessibilityIgnoresInvertColors />
      ) : (
        <Text style={styles.placeholder}>{moduleNames[module]}</Text>
      )}
    </View>
  );
}

/** The empty frame of a line without a still (a part gone from the catalogue, a bike): what it is, in words. */
export function ArtPlaceholder({ label, style }: { label: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.art, style]}>
      <Text style={styles.placeholder}>{label}</Text>
    </View>
  );
}

/** Stock as a fact, not a nudge: no countdowns, no "only X left!" urgency. */
export function StockNote({ stock }: { stock: number }) {
  return stock === 0 ? (
    <Text style={[styles.stock, { color: colors.danger }]}>Out of stock</Text>
  ) : (
    <Text style={[styles.stock, { color: colors.ok }]}>{stock} in stock</Text>
  );
}

/** The three numbers that define a product, set like a label stamped on the device. */
export function SpecPlate({ specs, style }: { specs: readonly Spec[]; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.plate, style]}>
      {specs.map((spec, i) => (
        <View key={spec.label} style={[styles.spec, i > 0 && styles.specDivider]}>
          <Text style={styles.specLabel}>{spec.label.toUpperCase()}</Text>
          <Text style={styles.specValue}>{keepUnits(spec.value)}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  art: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.still },
  // pinned to the frame's edges: a percentage size can leave iOS drawing the photo at its own size
  image: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  placeholder: { fontFamily: mono, fontSize: 11, color: colors.ink3, textTransform: 'uppercase' },
  stock: { fontFamily: mono, fontSize: 11 },
  plate: { flexDirection: 'row', borderWidth: 1, borderColor: colors.rule },
  spec: { flex: 1, paddingHorizontal: 8, paddingVertical: 6 },
  specDivider: { borderLeftWidth: 1, borderLeftColor: colors.rule },
  specLabel: { fontFamily: mono, fontSize: 11, color: colors.ink3, letterSpacing: 0.6 },
  specValue: { fontFamily: mono, fontSize: 12, fontWeight: '600', color: colors.ink },
});
