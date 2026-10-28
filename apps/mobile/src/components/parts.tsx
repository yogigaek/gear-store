import type { PartModule, Spec } from '@gear-store/shared';
import { useState } from 'react';
import {
  Image,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { keepUnits } from '../lib/format';
import { partStill } from '../lib/part-stills';
import { PLATE_TYPE, plateFitsColumns } from '../lib/spec-plate';
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

type Size = { width: number; height: number };

/** a box's own size in points, once laid out, so an image inside it never depends on a percentage */
function useBoxSize(): [Size | undefined, (e: LayoutChangeEvent) => void] {
  const [size, setSize] = useState<Size>();
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((old) => (old?.width === width && old.height === height ? old : { width, height }));
  };
  return [size, onLayout];
}

/**
 * A part's studio still; while a part has none, its module name, as on the web. `cover` fills a box the caller
 * sizes in points; `contain` shows the whole still in a box of any shape (one stretched to its row, say), on the
 * still's own ground so the bands above and below it do not show.
 */
export function PartImage({
  slug,
  module,
  colorKey,
  fit = 'cover',
  style,
}: {
  slug: string;
  module: PartModule;
  colorKey?: string;
  fit?: 'cover' | 'contain';
  style?: StyleProp<ViewStyle>;
}) {
  const still = partStill(slug, colorKey);
  const [box, onLayout] = useBoxSize();
  return (
    <View style={[styles.art, style]} onLayout={fit === 'contain' ? onLayout : undefined}>
      {!still ? (
        <Text style={styles.placeholder}>{moduleNames[module]}</Text>
      ) : fit === 'cover' ? (
        <Image source={still} style={styles.image} resizeMode="cover" accessibilityIgnoresInvertColors />
      ) : (
        // in points once laid out (a stretched box has no height before), out of the flow so the row can shrink
        box && (
          <Image
            source={still}
            style={[styles.contained, box]}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
        )
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

// the last plate width measured: the cards of a list share one, so each new card starts in the right layout
let lastPlateWidth = 0;

/**
 * The three numbers that define a product, set like a label stamped on the device: side by side when every word
 * fits its column, else one row each (plateFitsColumns), so no word ever breaks in the middle.
 */
export function SpecPlate({ specs, style }: { specs: readonly Spec[]; style?: StyleProp<ViewStyle> }) {
  const { fontScale } = useWindowDimensions();
  const [width, setWidth] = useState(lastPlateWidth);
  const columns = width === 0 || plateFitsColumns(specs, width, fontScale);
  return (
    <View
      style={[styles.plate, !columns && styles.plateRows, style]}
      onLayout={(e) => {
        lastPlateWidth = e.nativeEvent.layout.width;
        setWidth(lastPlateWidth);
      }}
    >
      {specs.map((spec, i) => (
        <View
          key={spec.label}
          style={[
            columns ? styles.spec : styles.specRow,
            i > 0 && (columns ? styles.specDivider : styles.rowDivider),
          ]}
        >
          <Text style={styles.specLabel}>{spec.label.toUpperCase()}</Text>
          <Text style={[styles.specValue, !columns && styles.rowValue]}>{keepUnits(spec.value)}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  art: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.still },
  // cover only: its box is sized in points by the caller, which is what iOS needs to draw the still at that size
  image: { width: '100%', height: '100%' },
  contained: { position: 'absolute', top: 0, left: 0 },
  placeholder: { fontFamily: mono, fontSize: 11, color: colors.ink3, textTransform: 'uppercase' },
  stock: { fontFamily: mono, fontSize: 11 },
  plate: { flexDirection: 'row', borderWidth: 1, borderColor: colors.rule },
  plateRows: { flexDirection: 'column' },
  spec: { flex: 1, paddingHorizontal: PLATE_TYPE.padding, paddingVertical: 6 },
  specDivider: { borderLeftWidth: 1, borderLeftColor: colors.rule },
  // a value too long to sit beside its label goes under it, still right-aligned
  specRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    columnGap: 12,
    paddingHorizontal: PLATE_TYPE.padding,
    paddingVertical: 6,
  },
  rowDivider: { borderTopWidth: 1, borderTopColor: colors.rule },
  specLabel: {
    fontFamily: mono,
    fontSize: PLATE_TYPE.label,
    color: colors.ink3,
    letterSpacing: PLATE_TYPE.tracking,
  },
  specValue: { fontFamily: mono, fontSize: PLATE_TYPE.value, fontWeight: '600', color: colors.ink },
  rowValue: { flexShrink: 1, marginLeft: 'auto', textAlign: 'right' },
});
