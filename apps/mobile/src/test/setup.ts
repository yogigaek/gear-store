import { vi } from 'vitest';

// The native modules the app's libraries use, replaced for tests that run in Node.
vi.mock('react-native', () => ({
  AppState: { addEventListener: () => ({ remove: () => undefined }) },
  Platform: {
    OS: 'android',
    select: (options: Record<string, unknown>) => options.android ?? options.default,
  },
}));
vi.mock('expo-secure-store', async () => (await import('./fakes')).secureStore);
vi.mock('@react-native-async-storage/async-storage', async () => ({
  default: (await import('./fakes')).asyncStorage,
}));
vi.mock('expo-crypto', () => ({ randomUUID: () => crypto.randomUUID() }));
vi.mock('expo-constants', () => ({ default: { expoConfig: { hostUri: 'localhost:8081' } } }));

(globalThis as { __DEV__?: boolean }).__DEV__ = false;
process.env.EXPO_PUBLIC_API_URL = 'http://api.test/api';
