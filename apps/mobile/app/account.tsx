import { router, useLocalSearchParams } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { AdminOnWeb } from '../src/components/AdminOnWeb';
import { Button } from '../src/components/Button';
import { Loading } from '../src/components/Loading';
import { auth, useAuth } from '../src/lib/auth';
import { useBottomSpace } from '../src/lib/use-bottom-space';
import { afterSignIn, openWeb } from '../src/lib/web';
import { colors, mono } from '../src/theme';

type Param = string | string[] | undefined;

export default function AccountScreen() {
  const state = useAuth();
  const bottom = useBottomSpace();
  const {
    next: nextParam,
    buy,
    finish,
    qty,
    number,
  } = useLocalSearchParams<{
    next?: Param;
    buy?: Param;
    finish?: Param;
    qty?: Param;
    number?: Param;
  }>();
  // sent here from checkout (the cart, or a Buy now) or an order screen: once signed in, carry on to it
  const carriedOn = useRef(false);
  useEffect(() => {
    const next = afterSignIn({ next: nextParam, buy, finish, qty, number });
    if (state.status !== 'signed-in' || !next || carriedOn.current) return;
    carriedOn.current = true;
    router.replace(next);
  }, [state.status, nextParam, buy, finish, qty, number]);

  if (state.status === 'restoring') return <Loading />;
  if (state.status === 'signed-out') return <SignIn />;

  const { user } = state;
  return (
    <ScrollView contentContainerStyle={[styles.page, { paddingBottom: bottom }]}>
      <Text style={styles.label}>Signed in as</Text>
      <Text style={styles.name}>{user.name}</Text>
      <Text style={styles.email}>{user.email}</Text>
      {user.isDemo && (
        <Text style={styles.note}>
          This is the shared demo account: anyone can sign in to it, and its name and password cannot change.
        </Text>
      )}
      <Button label="Your orders" href="/orders" style={styles.first} />
      <Button variant="secondary" label="Sign out" onPress={() => void auth.signOut()} />
      <AdminOnWeb />
    </ScrollView>
  );
}

function SignIn() {
  const headerHeight = useHeaderHeight();
  const bottom = useBottomSpace();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [working, setWorking] = useState<'demo' | 'email'>();
  const busy = working !== undefined;
  const [error, setError] = useState<string>();
  const passwordInput = useRef<ComponentRef<typeof TextInput>>(null);

  const run = async (kind: 'demo' | 'email', action: () => Promise<void>) => {
    setWorking(kind);
    setError(undefined);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setWorking(undefined);
    }
  };
  const canSignIn = !busy && !!email && !!password;
  const signIn = () => {
    if (canSignIn) void run('email', () => auth.signIn({ email: email.trim(), password }));
  };

  return (
    // padding on Android too: edge to edge (SDK 58), the window no longer shrinks for the keyboard. The view
    // measures itself from below the header, so the header's height is added to reach the keyboard's screen edge.
    <KeyboardAvoidingView style={styles.fill} behavior="padding" keyboardVerticalOffset={headerHeight}>
      <ScrollView
        contentContainerStyle={[styles.page, { paddingBottom: bottom }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title} maxFontSizeMultiplier={1.4}>
          Sign in
        </Text>
        <Button
          label={working === 'demo' ? 'Signing in…' : 'Try as shopper'}
          onPress={() => void run('demo', () => auth.signInDemo('shopper'))}
          disabled={busy}
          busy={working === 'demo'}
        />
        <Text style={styles.note}>
          A shared demo account with sample orders. Payments run in Midtrans sandbox; no money moves.
        </Text>
        {error && (
          <Text style={styles.error} accessibilityLiveRegion="polite">
            {error}
          </Text>
        )}

        <View style={styles.divider}>
          <View style={styles.rule} />
          <Text style={styles.dividerText}>or with your account</Text>
          <View style={styles.rule} />
        </View>

        <View style={styles.field}>
          <Text style={styles.label} nativeID="email-label">
            Email
          </Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            style={styles.input}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            accessibilityLabelledBy="email-label"
            editable={!busy}
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => passwordInput.current?.focus()}
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.label} nativeID="password-label">
            Password
          </Text>
          <TextInput
            ref={passwordInput}
            value={password}
            onChangeText={setPassword}
            style={styles.input}
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
            accessibilityLabelledBy="password-label"
            editable={!busy}
            returnKeyType="go"
            onSubmitEditing={signIn}
          />
        </View>
        <Button
          variant="secondary"
          label={working === 'email' ? 'Signing in…' : 'Sign in'}
          onPress={signIn}
          disabled={!canSignIn}
          busy={working === 'email'}
        />
        <View style={styles.links}>
          <Button
            variant="ghost"
            label="Create an account"
            onPress={() => void openWeb('/register')}
            accessibilityRole="link"
            accessibilityHint="Opens the Rakit website"
          />
          <Button
            variant="ghost"
            label="Forgot password?"
            onPress={() => void openWeb('/forgot-password')}
            accessibilityRole="link"
            accessibilityHint="Opens the Rakit website"
          />
        </View>
        <AdminOnWeb />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  page: { padding: 16, gap: 12 },
  title: { fontSize: 26, fontWeight: '800', color: colors.ink, textTransform: 'uppercase', marginBottom: 4 },
  field: { gap: 6 },
  label: {
    fontFamily: mono,
    fontSize: 12,
    color: colors.ink3,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.field,
    backgroundColor: colors.alu50,
    color: colors.ink,
    fontSize: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  error: { color: colors.danger, fontSize: 14 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 8 },
  rule: { flex: 1, height: 1, backgroundColor: colors.bench },
  dividerText: {
    flexShrink: 1,
    fontFamily: mono,
    fontSize: 11,
    color: colors.ink3,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  links: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 20 },
  first: { marginTop: 4 },
  note: { fontSize: 13, color: colors.ink3, lineHeight: 19 },
  name: { fontSize: 22, fontWeight: '700', color: colors.ink },
  email: { fontFamily: mono, fontSize: 13, color: colors.ink2 },
});
