import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../lib/auth';
import { useCartCount } from '../lib/cart';
import { count as counted } from '../lib/format';
import { useOpenOnce } from '../lib/use-open-once';
import { colors, mono } from '../theme';

/** The header's ways to the account and to the cart, with the number of parts in it. */
export function HeaderActions() {
  const count = useCartCount();
  const signedIn = useAuth().status === 'signed-in';
  const open = useOpenOnce();
  return (
    // not Links with asChild: their Slot merges the child's style as an object, so the pressed style would be lost
    <View style={styles.row}>
      <Pressable
        onPress={() => open('/account')}
        style={({ pressed }) => [styles.control, pressed && styles.pressed]}
        accessibilityRole="link"
      >
        <Text style={styles.account} maxFontSizeMultiplier={1.3}>
          {signedIn ? 'Account' : 'Sign in'}
        </Text>
      </Pressable>
      <Pressable
        onPress={() => open('/cart')}
        style={({ pressed }) => [styles.control, pressed && styles.pressed]}
        accessibilityRole="link"
        accessibilityLabel={count ? `Cart, ${counted(count, 'item')}` : 'Cart, empty'}
      >
        <Text style={styles.cart} maxFontSizeMultiplier={1.3}>
          Cart
        </Text>
        {count > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText} maxFontSizeMultiplier={1.3}>
              {count > 99 ? '99+' : count}
            </Text>
          </View>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  control: { minHeight: 44, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 6 },
  pressed: { opacity: 0.6 },
  account: { fontFamily: mono, fontSize: 13, color: colors.ink2 },
  cart: { fontFamily: mono, fontSize: 13, fontWeight: '600', color: colors.ink },
  // the header is a fixed height: its text grows no further than 1.3× however large the phone's text size
  badge: {
    minWidth: 18,
    minHeight: 18,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.signal,
  },
  badgeText: { fontFamily: mono, fontSize: 11, fontWeight: '700', color: colors.onSignal },
});
