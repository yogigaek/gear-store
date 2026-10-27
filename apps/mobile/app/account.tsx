import { Link } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { auth, useAuth } from '../src/lib/auth';
import { colors, mono } from '../src/theme';

export default function AccountScreen() {
  const state = useAuth();
  if (state.status === 'restoring') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.signal} />
      </View>
    );
  }
  if (state.status === 'signed-out') return <SignIn />;

  const { user } = state;
  return (
    <View style={styles.page}>
      <Text style={styles.label}>Signed in as</Text>
      <Text style={styles.name}>{user.name}</Text>
      <Text style={styles.email}>{user.email}</Text>
      {user.isDemo && (
        <Text style={styles.note}>
          This is the shared demo account: anyone can sign in to it, and its name and password cannot change.
        </Text>
      )}
      <Link href="/orders" asChild>
        <Pressable style={styles.primary} accessibilityRole="link">
          <Text style={styles.primaryText}>Your orders</Text>
        </Pressable>
      </Link>
      <Pressable onPress={() => void auth.signOut()} style={styles.secondary} accessibilityRole="button">
        <Text style={styles.secondaryText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(undefined);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Sign in</Text>
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
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.label} nativeID="password-label">
            Password
          </Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            style={styles.input}
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
            accessibilityLabelledBy="password-label"
            editable={!busy}
            onSubmitEditing={() => void run(() => auth.signIn({ email: email.trim(), password }))}
          />
        </View>
        {error && (
          <Text style={styles.error} accessibilityLiveRegion="polite">
            {error}
          </Text>
        )}
        <Pressable
          onPress={() => void run(() => auth.signIn({ email: email.trim(), password }))}
          disabled={busy || !email || !password}
          style={[styles.primary, (busy || !email || !password) && styles.disabled]}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy || !email || !password, busy }}
        >
          <Text style={styles.primaryText}>{busy ? 'Signing in…' : 'Sign in'}</Text>
        </Pressable>
        <View style={styles.divider} />
        <Pressable
          onPress={() => void run(() => auth.signInDemo('shopper'))}
          disabled={busy}
          style={styles.secondary}
          accessibilityRole="button"
        >
          <Text style={styles.secondaryText}>Try as shopper</Text>
        </Pressable>
        <Text style={styles.note}>
          A shared demo account with sample orders. Create your own account on the Rakit website.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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
    borderColor: colors.benchStrong,
    backgroundColor: colors.alu50,
    color: colors.ink,
    fontSize: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  error: { color: colors.danger, fontSize: 14 },
  primary: { backgroundColor: colors.signal, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  primaryText: { color: '#15181a', fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.4 },
  divider: { height: 1, backgroundColor: colors.bench, marginVertical: 8 },
  secondary: { borderWidth: 1, borderColor: colors.ink, paddingVertical: 13, alignItems: 'center' },
  secondaryText: { color: colors.ink, fontSize: 15, fontWeight: '600' },
  note: { fontSize: 13, color: colors.ink3, lineHeight: 19 },
  name: { fontSize: 22, fontWeight: '700', color: colors.ink },
  email: { fontFamily: mono, fontSize: 13, color: colors.ink2 },
});
