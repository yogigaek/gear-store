import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';
import { Button } from './Button';

/** A screen (or list) with nothing to show yet: a short message and the way forward, centred. */
export function EmptyState({ message, children }: { message: string; children?: ReactNode }) {
  return (
    <View style={styles.center}>
      <Text style={styles.message}>{message}</Text>
      {children}
    </View>
  );
}

/** the cart with nothing in it, on the cart and on checkout */
export function EmptyCart() {
  return (
    <EmptyState message="Your cart is empty.">
      <Button label="Browse parts" href="/products" />
    </EmptyState>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  message: { color: colors.ink2, textAlign: 'center', fontSize: 15, lineHeight: 21 },
});
