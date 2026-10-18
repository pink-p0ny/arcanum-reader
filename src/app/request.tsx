import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  asText,
  binderyStore,
  coverSource,
  ensureBinderyLoaded,
  getBook,
  hitAuthor,
  hitCover,
  hitRating,
  hitYear,
  listRequests,
  listWanted,
  searchBooks,
  type BinderyHit,
} from '@/lib/bindery';
import { useStore } from '@/lib/store';

/** A failure on this screen shows here instead of taking the whole app down with it. */
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  const theme = useTheme();
  const router = useRouter();
  return (
    <View style={[styles.screen, styles.errorScreen, { backgroundColor: theme.background }]}>
      <ThemedText type="title">Something went wrong</ThemedText>
      <ThemedText themeColor="textSecondary" selectable style={styles.errorText}>
        {error.message}
      </ThemedText>
      <View style={styles.errorActions}>
        <Pressable onPress={retry} style={styles.get}>
          <ThemedText style={styles.getText}>Try Again</ThemedText>
        </Pressable>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <ThemedText style={{ color: '#e8734a' }}>Close</ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

/** Search Bindery's metadata providers and ask for a book that is not in the library yet. */
export default function RequestScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const cfg = useStore(binderyStore);
  const [term, setTerm] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [done, setDone] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    ensureBinderyLoaded();
  }, []);

  const configured = !!cfg.url && cfg.hasKey;

  const results = useQuery({
    queryKey: ['bindery', 'search', submitted],
    queryFn: () => searchBooks(submitted),
    enabled: configured && submitted.length > 1,
  });
  const requests = useQuery({
    queryKey: ['bindery', 'requests'],
    queryFn: () => Promise.all([listRequests(10), listWanted(10)]),
    enabled: configured,
  });

  const ask = async (hit: BinderyHit) => {
    setBusy(hit.foreignBookId);
    try {
      const out = await getBook(hit);
      setDone((d) => ({
        ...d,
        [hit.foreignBookId]:
          out.status === 'added' ? 'On its way' : out.status === 'requested' ? 'Requested' : 'Already there',
      }));
      requests.refetch();
    } catch (e) {
      Alert.alert('Bindery said no', (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ title: 'Request a Book', presentation: 'modal' }} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.six }]}
        keyboardShouldPersistTaps="handled"
      >
        {!configured ? (
          <View style={styles.empty}>
            <ThemedText type="subtitle" style={styles.center}>
              Connect Bindery first
            </ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.center}>
              Add your Bindery address and API key under Settings › Bindery, then come back here to ask for
              books you do not have yet.
            </ThemedText>
            <Pressable onPress={() => router.back()} style={styles.primary}>
              <ThemedText style={styles.primaryText}>OK</ThemedText>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={[styles.search, { backgroundColor: theme.backgroundElement }]}>
              <TextInput
                value={term}
                onChangeText={setTerm}
                placeholder="Title or author"
                placeholderTextColor={theme.textSecondary}
                autoFocus
                autoCorrect={false}
                returnKeyType="search"
                onSubmitEditing={() => setSubmitted(term.trim())}
                style={[styles.input, { color: theme.text }]}
              />
              <Pressable onPress={() => setSubmitted(term.trim())} hitSlop={8}>
                <ThemedText style={styles.link}>Search</ThemedText>
              </Pressable>
            </View>

            {results.isFetching ? <ActivityIndicator style={styles.spinner} /> : null}
            {results.error ? (
              <ThemedText type="small" style={[styles.center, { color: '#d33' }]}>
                {(results.error as Error).message}
              </ThemedText>
            ) : null}
            {results.data && results.data.length === 0 ? (
              <ThemedText themeColor="textSecondary" style={styles.center}>
                Nothing found for “{submitted}”.
              </ThemedText>
            ) : null}

            {(results.data ?? []).map((hit, i) => (
              <Hit
                key={`${hit.foreignBookId}-${i}`}
                hit={hit}
                state={done[hit.foreignBookId] ?? (hit.libraryBookId ? 'In Bindery' : null)}
                busy={busy === hit.foreignBookId}
                onAsk={() => ask(hit)}
              />
            ))}

            {requests.data && (requests.data[0].length > 0 || requests.data[1].length > 0) ? (
              <View style={styles.section}>
                <ThemedText type="small" themeColor="textSecondary" style={styles.sectionTitle}>
                  ON THE WAY
                </ThemedText>
                {requests.data[1].map((w) => (
                  <View key={`w${w.id}`} style={[styles.row, { backgroundColor: theme.backgroundElement }]}>
                    <View style={styles.rowText}>
                      <ThemedText numberOfLines={1}>{asText(w.title)}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                        {asText(w.authorName)}
                      </ThemedText>
                    </View>
                    <ThemedText type="small" themeColor="textSecondary">
                      {w.monitored === false ? 'Paused' : 'Searching'}
                    </ThemedText>
                  </View>
                ))}
                {requests.data[0].map((r) => (
                  <View key={`r${r.id}`} style={[styles.row, { backgroundColor: theme.backgroundElement }]}>
                    <View style={styles.rowText}>
                      <ThemedText numberOfLines={1}>{asText(r.title)}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                        {asText(r.authorName)}
                        {r.declineReason ? ` · ${asText(r.declineReason)}` : ''}
                      </ThemedText>
                    </View>
                    <ThemedText type="small" themeColor="textSecondary">
                      {r.fulfilled ? 'Arrived' : r.status === 'pending' ? 'Pending' : asText(r.status)}
                    </ThemedText>
                  </View>
                ))}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Hit({
  hit,
  state,
  busy,
  onAsk,
}: {
  hit: BinderyHit;
  state: string | null;
  busy: boolean;
  onAsk: () => void;
}) {
  const theme = useTheme();
  const [cover, setCover] = useState<{ uri: string; headers: Record<string, string> } | null>(null);
  const remote = hitCover(hit);
  useEffect(() => {
    let live = true;
    if (remote) coverSource(remote).then((s) => live && setCover(s));
    return () => {
      live = false;
    };
  }, [remote]);
  const year = hitYear(hit);
  const rating = hitRating(hit);
  const series = asText(hit.series);
  return (
    <View style={[styles.hit, { backgroundColor: theme.backgroundElement }]}>
      <View style={[styles.cover, { backgroundColor: theme.backgroundSelected }]}>
        {cover ? <Image source={cover} style={styles.coverImage} contentFit="cover" /> : null}
      </View>
      <View style={styles.rowText}>
        <ThemedText numberOfLines={2} style={styles.title}>
          {asText(hit.title)}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {hitAuthor(hit)}
          {year ? ` · ${year}` : ''}
          {rating ? ` · ★ ${rating.toFixed(1)}` : ''}
        </ThemedText>
        {series ? (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {series}
            {hit.seriesPosition ? ` #${asText(hit.seriesPosition)}` : ''}
          </ThemedText>
        ) : null}
      </View>
      {state ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.state}>
          {state}
        </ThemedText>
      ) : (
        <Pressable onPress={onAsk} disabled={busy} style={[styles.get, busy && styles.disabled]}>
          <ThemedText style={styles.getText}>{busy ? '…' : 'Get'}</ThemedText>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.two },
  empty: { alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.six },
  center: { textAlign: 'center' },
  errorScreen: { padding: Spacing.four, gap: Spacing.three, justifyContent: 'center' },
  errorText: { fontFamily: 'Menlo' },
  errorActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.four },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
  },
  input: { flex: 1, fontSize: 17, paddingVertical: 12 },
  link: { color: '#e8734a', fontWeight: '600' },
  spinner: { marginVertical: Spacing.three },
  hit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: 12,
    padding: Spacing.two,
  },
  cover: { width: 44, height: 66, borderRadius: 4, overflow: 'hidden' },
  coverImage: { width: 44, height: 66 },
  rowText: { flex: 1, gap: 2 },
  title: { fontWeight: '600' },
  state: { paddingHorizontal: Spacing.two },
  get: { backgroundColor: '#e8734a', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  getText: { color: '#fff', fontWeight: '600' },
  section: { gap: Spacing.two, marginTop: Spacing.four },
  sectionTitle: { letterSpacing: 0.6, paddingHorizontal: Spacing.one },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  primary: {
    backgroundColor: '#e8734a',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  primaryText: { color: '#fff', fontWeight: '600' },
  disabled: { opacity: 0.5 },
});
