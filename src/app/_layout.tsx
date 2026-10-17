import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useStore } from '@/lib/store';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { AppState, Linking, useColorScheme } from 'react-native';

import { importEpubs } from '@/lib/library-folder';
import { syncLibrary } from '@/lib/library';
import { loadLocalOnly, loadSession, localOnlyStore, sessionStore } from '@/lib/session';
import { ensureHiddenGenresLoaded } from '@/lib/genres';
import { loadSettings } from '@/lib/settings';
import { flushPending } from '@/lib/sync';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const { ready, session } = useStore(sessionStore);
  const localOnly = useStore(localOnlyStore);
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    Promise.all([loadSession(), loadSettings(), loadLocalOnly(), ensureHiddenGenresLoaded()])
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

  // "Open in Arcanum": an EPUB handed over by Files, Mail or Safari lands in the library folder.
  useEffect(() => {
    if (!booted) return;
    const handle = (url: string | null) => {
      if (!url || !url.startsWith('file://') || !/\.(epub|mobi|azw3?|kf8|fb2|prc)$/i.test(url)) return;
      importEpubs([url])
        .then(() => syncLibrary())
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ['library'] });
          queryClient.invalidateQueries({ queryKey: ['home'] });
        })
        .catch(() => {});
    };
    Linking.getInitialURL().then(handle);
    const sub = Linking.addEventListener('url', (e) => handle(e.url));
    return () => sub.remove();
  }, [booted]);

  if (!booted || !ready) return null;
  const signedIn = !!session || localOnly;

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack>
          <Stack.Protected guard={signedIn}>
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
          <Stack.Protected guard={!session}>
            <Stack.Screen
              name="login"
              options={{ headerShown: false, presentation: localOnly ? 'modal' : 'card' }}
            />
          </Stack.Protected>
        </Stack>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
