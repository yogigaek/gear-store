import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';

/**
 * A screen's main action, kept in reach under its scrolling content (laid out below it, not over it, so nothing
 * hides behind the bar). The bar takes the home indicator's inset; the content above uses useBottomSpace(true).
 */
export function BottomBar({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return <View style={[styles.bar, { paddingBottom: 12 + insets.bottom }]}>{children}</View>;
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.stage,
    borderTopWidth: 1,
    borderTopColor: colors.bench,
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 10,
  },
});
