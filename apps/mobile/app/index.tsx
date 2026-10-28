import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { AdminOnWeb } from '../src/components/AdminOnWeb';
import { Button } from '../src/components/Button';
import { auth, useAuth } from '../src/lib/auth';
import { useCategories } from '../src/lib/catalog';
import { posterFrame } from '../src/lib/poster';
import { useBottomSpace } from '../src/lib/use-bottom-space';
import { openWeb } from '../src/lib/web';
import { colors, mono } from '../src/theme';

/** The web's landing page without its 3D: the bike, what Rakit is, and the ways in. */
export default function HomeScreen() {
  const state = useAuth();
  const categories = useCategories();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  // the demo sign-in from this card worked: say so, rather than the card simply vanishing
  const [signedInHere, setSignedInHere] = useState(false);
  const bottom = useBottomSpace();
  // sized from the screen: a percentage width let iOS draw the photo at its own size, cropped to its dark corner
  const poster = posterFrame(useWindowDimensions().width);

  const tryAsShopper = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await auth.signInDemo('shopper');
      setSignedInHere(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not sign in. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    // the stage colour of the header and the photo, so pulling past the top shows no lighter band
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: bottom }}>
      <View
        style={[styles.poster, { width: poster.width, height: poster.height }]}
        accessible
        accessibilityRole="image"
        accessibilityLabel="The Rakit E-1, a yellow full-suspension e-bike"
      >
        <Image
          source={require('../../web/src/assets/e1-poster-wide.jpg')}
          style={[styles.posterImage, poster.image]}
          resizeMode="cover"
        />
      </View>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>Rakit E-1 · Full-suspension e-MTB</Text>
        <Text style={styles.title} accessibilityRole="header" maxFontSizeMultiplier={1.4}>
          Built to be taken apart.
        </Text>
        <Text style={styles.lead}>
          A 29-inch trail bike with a mid-drive motor, every part of it listed, priced, and serviceable with
          the tools in a home workshop.
        </Text>
        <Button label="Browse parts" href="/products" style={styles.first} />
        <Button
          variant="secondary"
          label="Configure yours in 3D on the web"
          onPress={() => void openWeb('/#configure')}
          accessibilityRole="link"
          accessibilityHint="Opens the Rakit website"
        />
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
          <Button
            label={busy ? 'Signing in…' : 'Try as shopper'}
            onPress={() => void tryAsShopper()}
            disabled={busy}
            busy={busy}
          />
        </View>
      )}
      {state.status === 'signed-in' && state.user.isDemo && signedInHere && (
        <View style={[styles.section, styles.card]} accessibilityLiveRegion="polite">
          <Text style={styles.signedIn}>Signed in as the demo shopper</Text>
          <Text style={styles.note}>
            Add parts to the cart and check out; the sample orders are in Orders.
          </Text>
          <Button variant="ghost" label="Your orders" href="/orders" />
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.label}>Shop by part</Text>
        {categories.isFetching && !categories.data && (
          <ActivityIndicator color={colors.signal} style={styles.spinner} />
        )}
        {categories.isError && !categories.data && (
          <View>
            <Text style={styles.note}>{categories.error.message}</Text>
            <Button variant="ghost" label="Try again" onPress={() => void categories.refetch()} />
          </View>
        )}
        <View style={styles.types}>
          {categories.data
            ?.filter((c) => c.productCount > 0)
            .map((c) => (
              <Pressable
                key={c.slug}
                onPress={() => router.push({ pathname: '/products', params: { category: c.slug } })}
                style={({ pressed }) => [styles.type, pressed && styles.pressed]}
                accessibilityRole="link"
                accessibilityLabel={`${c.name}, ${c.productCount} on sale`}
              >
                <Text style={styles.typeName}>{c.name}</Text>
                <Text style={styles.typeCount}>{c.productCount}</Text>
              </Pressable>
            ))}
        </View>
      </View>

      <View style={styles.section}>
        <AdminOnWeb />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.stage },
  poster: { overflow: 'hidden', backgroundColor: colors.stage },
  posterImage: { position: 'absolute' },
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
  first: { marginTop: 4 },
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
  pressed: { opacity: 0.85 },
  typeName: { fontSize: 14, fontWeight: '600', color: colors.ink },
  typeCount: { fontFamily: mono, fontSize: 12, color: colors.ink3 },
  card: { borderWidth: 1, borderColor: colors.bench, backgroundColor: colors.alu50, padding: 14 },
  cardTitle: { fontSize: 17, fontWeight: '700', color: colors.ink },
  signedIn: { fontSize: 17, fontWeight: '700', color: colors.ok },
  note: { fontSize: 13, color: colors.ink3, lineHeight: 19 },
  error: { color: colors.danger, fontSize: 14 },
});
