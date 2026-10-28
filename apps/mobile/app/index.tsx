import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AdminOnWeb } from '../src/components/AdminOnWeb';
import { auth, useAuth } from '../src/lib/auth';
import { useCategories } from '../src/lib/catalog';
import { openWeb } from '../src/lib/web';
import { colors, mono } from '../src/theme';

/** The web's landing page without its 3D: the bike, what Rakit is, and the ways in. */
export default function HomeScreen() {
  const state = useAuth();
  const categories = useCategories();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const tryAsShopper = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await auth.signInDemo('shopper');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not sign in. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Image
        source={require('../../web/src/assets/e1-poster-wide.jpg')}
        style={styles.poster}
        resizeMode="cover"
        accessible
        accessibilityRole="image"
        accessibilityLabel="The Rakit E-1, a yellow full-suspension e-bike"
      />
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>Rakit E-1 · Full-suspension e-MTB</Text>
        <Text style={styles.title} accessibilityRole="header">
          Built to be taken apart.
        </Text>
        <Text style={styles.lead}>
          A 29-inch trail bike with a mid-drive motor, every part of it listed, priced, and serviceable with
          the tools in a home workshop.
        </Text>
        <Pressable onPress={() => router.push('/products')} style={styles.primary} accessibilityRole="link">
          <Text style={styles.primaryText}>Browse parts</Text>
        </Pressable>
        <Pressable
          onPress={() => void openWeb('/#configure')}
          style={styles.secondary}
          accessibilityRole="link"
          accessibilityHint="Opens the Rakit website"
        >
          <Text style={styles.secondaryText}>Configure yours in 3D on the web</Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Shop by part</Text>
        {categories.isFetching && !categories.data && (
          <ActivityIndicator color={colors.signal} style={styles.spinner} />
        )}
        {categories.isError && !categories.data && (
          <View style={styles.failed}>
            <Text style={styles.note}>{categories.error.message}</Text>
            <Pressable
              onPress={() => void categories.refetch()}
              style={styles.retryButton}
              accessibilityRole="button"
            >
              <Text style={styles.retry}>Try again</Text>
            </Pressable>
          </View>
        )}
        <View style={styles.types}>
          {categories.data
            ?.filter((c) => c.productCount > 0)
            .map((c) => (
              <Pressable
                key={c.slug}
                onPress={() => router.push({ pathname: '/products', params: { category: c.slug } })}
                style={styles.type}
                accessibilityRole="link"
                accessibilityLabel={`${c.name}, ${c.productCount} on sale`}
              >
                <Text style={styles.typeName}>{c.name}</Text>
                <Text style={styles.typeCount}>{c.productCount}</Text>
              </Pressable>
            ))}
        </View>
      </View>

      {state.status === 'signed-out' && (
        <View style={[styles.section, styles.card]}>
          <Text style={styles.cardTitle}>Try it as a shopper</Text>
          <Text style={styles.note}>
            A shared demo account with sample orders. Payments run in Midtrans sandbox; no money moves.
          </Text>
          {error && (
            <Text style={styles.error} accessibilityLiveRegion="polite">
              {error}
            </Text>
          )}
          <Pressable
            onPress={() => void tryAsShopper()}
            disabled={busy}
            style={StyleSheet.flatten([styles.primary, busy && styles.disabled])}
            accessibilityRole="button"
            accessibilityState={{ disabled: busy, busy }}
          >
            <Text style={styles.primaryText}>{busy ? 'Signing in…' : 'Try as shopper'}</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.section}>
        <AdminOnWeb />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { paddingBottom: 32 },
  poster: { width: '100%', aspectRatio: 1440 / 836, backgroundColor: colors.stage },
  hero: { paddingHorizontal: 16, paddingTop: 20, gap: 12 },
  eyebrow: {
    fontFamily: mono,
    fontSize: 12,
    color: colors.signal,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  title: { fontSize: 34, lineHeight: 36, fontWeight: '900', color: colors.ink, textTransform: 'uppercase' },
  lead: { fontSize: 16, lineHeight: 23, color: colors.ink2 },
  primary: { backgroundColor: colors.signal, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  primaryText: {
    color: '#15181a',
    fontSize: 15,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  secondary: { borderWidth: 1, borderColor: colors.ink, paddingVertical: 13, alignItems: 'center' },
  secondaryText: { color: colors.ink, fontSize: 15, fontWeight: '600' },
  disabled: { opacity: 0.5 },
  section: { marginHorizontal: 16, marginTop: 28, gap: 10 },
  label: {
    fontFamily: mono,
    fontSize: 12,
    color: colors.ink3,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  spinner: { alignSelf: 'flex-start' },
  types: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  type: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.benchStrong,
    paddingHorizontal: 12,
    paddingVertical: 11,
    minHeight: 44,
  },
  typeName: { fontSize: 14, fontWeight: '600', color: colors.ink },
  typeCount: { fontFamily: mono, fontSize: 12, color: colors.ink3 },
  card: { borderWidth: 1, borderColor: colors.bench, backgroundColor: colors.alu50, padding: 14 },
  cardTitle: { fontSize: 17, fontWeight: '700', color: colors.ink },
  note: { fontSize: 13, color: colors.ink3, lineHeight: 19 },
  error: { color: colors.danger, fontSize: 14 },
  failed: { gap: 6 },
  retry: { fontSize: 14, fontWeight: '600', color: colors.ink, textDecorationLine: 'underline' },
  retryButton: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
});
