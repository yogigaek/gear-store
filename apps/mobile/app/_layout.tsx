import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { CartSync } from '../src/components/CartSync';
import { HeaderActions } from '../src/components/HeaderActions';
import { auth } from '../src/lib/auth';
import { colors } from '../src/theme';

// a screen opened from a link (rakit://orders/<n>) has the catalogue under it, so back stays in the app
export const unstable_settings = { anchor: 'index' };

export default function RootLayout() {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 60_000 } } }),
  );
  useEffect(() => {
    void auth.restore();
    // the app in the foreground is what "window focus" means to TanStack Query: stale reads refresh on return
    const sub = AppState.addEventListener('change', (status) => {
      focusManager.setFocused(status === 'active');
      if (status === 'active') void auth.resume();
    });
    return () => sub.remove();
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <CartSync />
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.stage },
          headerTintColor: colors.ink,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.alu },
          headerRight: () => <HeaderActions />,
        }}
      >
        <Stack.Screen name="index" options={{ title: 'Rakit · Parts' }} />
        <Stack.Screen name="cart" options={{ title: 'Cart', headerRight: undefined }} />
        <Stack.Screen name="account" options={{ title: 'Account', headerRight: undefined }} />
        <Stack.Screen name="checkout" options={{ title: 'Checkout', headerRight: undefined }} />
        <Stack.Screen name="addresses/new" options={{ title: 'New address', headerRight: undefined }} />
        <Stack.Screen name="orders/[number]" options={{ title: 'Order' }} />
        <Stack.Screen name="orders/index" options={{ title: 'Orders' }} />
      </Stack>
    </QueryClientProvider>
  );
}
