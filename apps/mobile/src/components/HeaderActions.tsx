import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../lib/auth';
import { useCartCount } from '../lib/cart';
import { count as counted } from '../lib/format';
import { colors, mono } from '../theme';

/** The header's ways to the account and to the cart, with the number of parts in it. */
export function HeaderActions() {
  const count = useCartCount();
  const signedIn = useAuth().status === 'signed-in';
  return (
    <View style={styles.row}>
      <Link href="/account" asChild>
        <Pressable style={styles.control} accessibilityRole="link">
          <Text style={styles.account}>{signedIn ? 'Account' : 'Sign in'}</Text>
        </Pressable>
      </Link>
      <Link href="/cart" asChild>
        <Pressable
          style={styles.control}
          accessibilityRole="link"
          accessibilityLabel={count ? `Cart, ${counted(count, 'item')}` : 'Cart, empty'}
        >
          <Text style={styles.cart}>Cart</Text>
          {count > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText} maxFontSizeMultiplier={1.2}>
                {count > 99 ? '99+' : count}
              </Text>
            </View>
          )}
        </Pressable>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  control: { minHeight: 44, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 6 },
  account: { fontFamily: mono, fontSize: 13, color: colors.ink2 },
  cart: { fontFamily: mono, fontSize: 13, fontWeight: '600', color: colors.ink },
  // a fixed box: the header is a fixed height, so the count does not grow with the text size past 1.2×
  badge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.signal,
  },
  badgeText: { fontFamily: mono, fontSize: 11, fontWeight: '700', color: colors.onSignal },
});
