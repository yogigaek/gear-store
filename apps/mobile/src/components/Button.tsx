import type { Href } from 'expo-router';
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { useOpenOnce } from '../lib/use-open-once';
import { colors } from '../theme';

type Variant = 'primary' | 'secondary' | 'ghost';

interface ButtonProps {
  label: string;
  variant?: Variant;
  /** a route to open; the button then reads as a link */
  href?: Href;
  onPress?: () => void;
  disabled?: boolean;
  busy?: boolean;
  /** a ghost button for something that cannot be undone */
  danger?: boolean;
  /** layout only (flex, margins, alignSelf): the look belongs to the variant */
  style?: StyleProp<ViewStyle>;
  /** 'link' for a button that opens a page outside the app; a `href` is always a link */
  accessibilityRole?: 'button' | 'link';
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

/**
 * The web's Button on the dark store: primary in signal yellow, secondary outlined, ghost underlined. A route is
 * opened with router.push, not by wrapping in an expo-router Link: its Slot would drop the pressed style.
 */
export function Button({
  label,
  variant = 'primary',
  href,
  onPress,
  disabled = false,
  busy = false,
  danger = false,
  style,
  accessibilityRole = 'button',
  accessibilityLabel,
  accessibilityHint,
}: ButtonProps) {
  const open = useOpenOnce();
  return (
    <Pressable
      onPress={href ? () => open(href) : onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        disabled && disabledBox[variant],
        pressed && styles.pressed,
        style,
      ]}
      accessibilityRole={href ? 'link' : accessibilityRole}
      accessibilityState={{ disabled, busy }}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
    >
      <Text
        style={[
          variant === 'ghost' ? styles.ghostText : styles.label,
          variant === 'primary' ? styles.primaryText : styles.secondaryText,
          danger && styles.dangerText,
          disabled && disabledText[variant],
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  primary: { minHeight: 48, paddingHorizontal: 20, paddingVertical: 12, backgroundColor: colors.signal },
  secondary: {
    minHeight: 48,
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: colors.rule,
  },
  ghost: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center', paddingVertical: 8 },
  pressed: { opacity: 0.85 },
  label: {
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    textAlign: 'center',
  },
  ghostText: { fontSize: 14, fontWeight: '600', textDecorationLine: 'underline' },
  primaryText: { color: colors.onSignal },
  secondaryText: { color: colors.ink },
  dangerText: { color: colors.danger },
});

// as the web's dark surface: a disabled button is greyed by colour, not faded, so its label stays legible
const disabledBox = StyleSheet.create({
  primary: { backgroundColor: colors.benchStrong },
  secondary: { borderColor: colors.bench },
  ghost: {},
});

const disabledText = StyleSheet.create({
  primary: { color: colors.ink2 },
  secondary: { color: colors.ink3 },
  ghost: { color: colors.ink3 },
});
