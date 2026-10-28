import { Pressable, StyleSheet, Text } from 'react-native';
import { openWeb } from '../lib/web';
import { colors } from '../theme';

/** The app is the shop; the admin side (orders, stock, revenue) is on the web, with its own demo account. */
export function AdminOnWeb() {
  return (
    <Pressable
      onPress={() => void openWeb('/admin')}
      style={styles.link}
      accessibilityRole="link"
      accessibilityHint="Opens the Rakit website"
    >
      <Text style={styles.text}>Admin dashboard on the web: try it with "Try as admin" →</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  link: { minHeight: 44, justifyContent: 'center' },
  text: { fontSize: 14, color: colors.ink2, textDecorationLine: 'underline' },
});
