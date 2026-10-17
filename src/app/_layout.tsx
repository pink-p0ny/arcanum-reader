import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useStore } from '@/lib/store';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { AppState, useColorScheme } from 'react-native';

import { loadSession, sessionStore } from '@/lib/session';
import { loadSettings } from '@/lib/settings';
import { flushPending } from '@/lib/sync';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const { ready, session } = useStore(sessionStore);
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    Promise.all([loadSession(), loadSettings()])
      .catch(() => {})
      .finally(() => setBooted(true));
  }, []);

  useEffect(() => {
    if (!booted) return;
    SplashScreen.hideAsync();
  }, [booted]);

  // Retry anything that failed to sync whenever the app comes back to the foreground.
  useEffect(() => {
    if (!session) return;
    flushPending().catch(() => {});
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') flushPending().catch(() => {});
    });
    return () => sub.remove();
  }, [session]);

  if (!booted || !ready) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack>
          <Stack.Protected guard={!session}>
            <Stack.Screen name="login" options={{ headerShown: false }} />
          </Stack.Protected>
          <Stack.Protected guard={!!session}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen
              name="book/[id]"
              options={{
                // Chevron only: the label would otherwise be the previous route's name, "(tabs)".
                headerBackButtonDisplayMode: 'minimal',
                title: '',
                headerTransparent: true,
                headerBlurEffect: 'regular',
              }}
            />
            <Stack.Screen name="request" options={{ title: 'Request a Book', presentation: 'modal' }} />
            <Stack.Screen
              name="read/[id]"
              options={{
                headerShown: false,
                presentation: 'fullScreenModal',
                gestureEnabled: false,
              }}
            />
          </Stack.Protected>
        </Stack>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
