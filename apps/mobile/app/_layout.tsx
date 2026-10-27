import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { CartSync } from '../src/components/CartSync';
import { HeaderActions } from '../src/components/HeaderActions';
import { auth } from '../src/lib/auth';
import { colors } from '../src/theme';

export default function RootLayout() {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 60_000 } } }),
  );
  useEffect(() => {
    void auth.restore();
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
