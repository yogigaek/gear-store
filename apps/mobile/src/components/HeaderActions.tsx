import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../lib/auth';
import { useCartCount } from '../lib/cart';
import { colors, mono } from '../theme';

/** The header's ways to the account and to the cart, with the number of parts in it. */
export function HeaderActions() {
  const count = useCartCount();
  const signedIn = useAuth().status === 'signed-in';
  return (
    <View style={styles.row}>
      <Link href="/account" asChild>
        <Pressable hitSlop={8} accessibilityRole="link">
          <Text style={styles.account}>{signedIn ? 'Account' : 'Sign in'}</Text>
        </Pressable>
      </Link>
      <Link href="/cart" asChild>
        <Pressable
          hitSlop={8}
          accessibilityRole="link"
          accessibilityLabel={count ? `Cart, ${count} items` : 'Cart, empty'}
        >
          <Text style={styles.cart}>Cart{count ? ` · ${count}` : ''}</Text>
        </Pressable>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  account: { fontFamily: mono, fontSize: 13, color: colors.ink2 },
  cart: { fontFamily: mono, fontSize: 13, fontWeight: '600', color: colors.signal },
});
