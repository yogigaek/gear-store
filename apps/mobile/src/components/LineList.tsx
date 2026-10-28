import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, mono } from '../theme';

export interface Line {
  key: string;
  art: ReactNode;
  name: string;
  /** "qty × model · finish" */
  detail: string;
  total: string;
}

/** The lines of an order, or of one about to be placed: one bench box, a hairline between rows. */
export function LineList({ lines }: { lines: Line[] }) {
  return (
    <View style={styles.box}>
      {lines.map((line, i) => (
        <View key={line.key} style={[styles.row, i > 0 && styles.divider]}>
          {line.art}
          <View style={styles.body}>
            <Text style={styles.name}>{line.name}</Text>
            <Text style={styles.detail}>{line.detail}</Text>
          </View>
          <Text style={styles.total}>{line.total}</Text>
        </View>
      ))}
    </View>
  );
}

/** the art's size in a LineList row */
export const lineArt = { width: 56, height: 56 } as const;

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderColor: colors.bench },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10 },
  divider: { borderTopWidth: 1, borderTopColor: colors.bench },
  body: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontSize: 15, fontWeight: '600', color: colors.ink },
  detail: { fontFamily: mono, fontSize: 11, color: colors.ink3 },
  total: { flexShrink: 0, fontFamily: mono, fontSize: 14, fontWeight: '600', color: colors.ink },
});
