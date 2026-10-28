import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, mono } from '../theme';
import { Button } from './Button';

/** Midtrans' published sandbox test card (docs.midtrans.com → Testing payment on sandbox), as on the web. */
const TEST_CARD = { number: '4811 1111 1111 1114', cvv: '123', otp: '112233' };
const SIMULATOR = 'https://simulator.sandbox.midtrans.com';

/**
 * How to finish a payment on the demo (the web's SandboxPaymentGuide). A card payment completes inside Midtrans'
 * page with the test card; a virtual account only through Midtrans' simulator, a separate site nobody would guess.
 * The values are selectable rather than behind a copy button: the app has no clipboard module.
 */
export function SandboxPaymentGuide({ initiallyOpen = false }: { initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <View style={styles.card}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        style={({ pressed }) => [styles.head, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <Text style={styles.title}>How to pay on this demo</Text>
        <Text style={styles.tag}>Sandbox</Text>
        <Text style={styles.chevron} importantForAccessibility="no" accessibilityElementsHidden>
          {open ? '▴' : '▾'}
        </Text>
      </Pressable>
      {open && (
        <View style={styles.body}>
          <Text style={styles.text}>
            <Text style={styles.strong}>Quickest: Card Payment.</Text> On the Midtrans page choose{' '}
            <Text style={styles.em}>Card Payment</Text> and enter Midtrans&apos; test card:
          </Text>
          <View style={styles.facts}>
            <Fact label="Card" value={TEST_CARD.number} />
            <Fact label="Expiry" value="any future month, e.g. 12/30" />
            <Fact label="CVV" value={TEST_CARD.cvv} />
            <Fact label="OTP" value={TEST_CARD.otp} />
          </View>
          <Text style={styles.text}>
            <Text style={styles.strong}>Or a virtual account.</Text> Choose a bank and copy the account number
            Midtrans shows. Then open the Midtrans sandbox simulator, pick the same bank, paste the number and
            pay there.
          </Text>
          <Button
            variant="ghost"
            label="Open the Midtrans sandbox simulator"
            onPress={() => void WebBrowser.openBrowserAsync(SIMULATOR)}
            accessibilityRole="link"
            accessibilityHint="Opens Midtrans' simulator in a browser"
          />
          <Text style={styles.quiet}>
            No real money moves. Back in the app, the payment is checked by itself and the order turns to Paid
            once Midtrans confirms it, usually within a minute.
          </Text>
        </View>
      )}
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue} selectable>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: colors.bench, backgroundColor: colors.alu50 },
  head: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  pressed: { opacity: 0.85 },
  title: { flex: 1, minWidth: 0, fontSize: 14, fontWeight: '600', color: colors.ink },
  tag: { fontFamily: mono, fontSize: 11, color: colors.ink3, textTransform: 'uppercase', letterSpacing: 0.8 },
  chevron: { fontSize: 14, color: colors.ink3 },
  body: { borderTopWidth: 1, borderTopColor: colors.bench, padding: 14, gap: 12 },
  text: { fontSize: 14, lineHeight: 20, color: colors.ink2 },
  strong: { fontWeight: '700', color: colors.ink },
  em: { fontStyle: 'italic' },
  facts: { gap: 6 },
  fact: { flexDirection: 'row', alignItems: 'baseline', gap: 12 },
  factLabel: {
    width: 56,
    fontFamily: mono,
    fontSize: 11,
    color: colors.ink3,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  factValue: { flex: 1, minWidth: 0, fontFamily: mono, fontSize: 13, color: colors.ink },
  quiet: { fontSize: 13, lineHeight: 19, color: colors.ink3 },
});
