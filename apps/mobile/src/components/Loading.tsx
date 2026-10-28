import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors } from '../theme';

/** how long a first load runs before the screen says why it may take a while */
export const SLOW_LOAD_MS = 5_000;

/** true once `loading` has stayed true for SLOW_LOAD_MS */
export function useSlowLoad(loading: boolean): boolean {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => setSlow(true), SLOW_LOAD_MS);
    return () => {
      clearTimeout(timer);
      setSlow(false);
    };
  }, [loading]);
  return loading && slow;
}

/** The hosted API sleeps when idle (Render's free tier) and its first reply can take up to a minute. */
export function SlowNote({
  loading,
  centered = false,
  style,
}: {
  loading: boolean;
  centered?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  if (!useSlowLoad(loading)) return null;
  return (
    <View style={style} accessibilityLiveRegion="polite">
      <Text style={[styles.note, centered && styles.centered]}>
        Waking the store&apos;s server (free hosting) — this can take up to a minute.
      </Text>
    </View>
  );
}

/** a screen's first load: a spinner, and after a few seconds the reason it may be slow */
export function Loading() {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.signal} />
      <SlowNote loading centered style={styles.slow} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  slow: { marginTop: 16, maxWidth: 320 },
  note: { fontSize: 13, lineHeight: 19, color: colors.ink3 },
  centered: { textAlign: 'center' },
});
