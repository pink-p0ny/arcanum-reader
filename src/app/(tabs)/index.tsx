import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GenreChips } from '@/components/genre-chips';
import { LargeTitle } from '@/components/large-title';
import { LuckySheet } from '@/components/lucky-sheet';
import { ShelfRow } from '@/components/shelf-row';
import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useHome } from '@/lib/home';
import { lastSyncedAt, useLibrarySync } from '@/lib/library';

export default function HomeScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { data, isLoading, refetch } = useHome();
  const { sync, syncing, error } = useLibrarySync();
  const didInitialSync = useRef(false);
  const [showLucky, setShowLucky] = useState(false);

  // First launch: pull the catalog. Later launches: refresh quietly in the background.
  useEffect(() => {
    if (didInitialSync.current) return;
    didInitialSync.current = true;
    lastSyncedAt().then((t) => {
      if (!t || Date.now() - t > 5 * 60 * 1000) sync();
    });
  }, [sync]);

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: insets.top,
          paddingBottom: insets.bottom + BottomTabInset + Spacing.four,
        },
      ]}
      refreshControl={<RefreshControl refreshing={syncing} onRefresh={sync} />}
    >
      <LargeTitle
        title="Home"
        right={
          data && !data.empty ? (
            <Pressable onPress={() => setShowLucky(true)} hitSlop={8} style={styles.lucky}>
              <ThemedText style={styles.luckyText}>✦ Surprise Me</ThemedText>
            </Pressable>
          ) : undefined
        }
      />
      <LuckySheet visible={showLucky} onClose={() => setShowLucky(false)} />

      {error ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.notice}>
          {error}
        </ThemedText>
      ) : null}

      {isLoading || (!data && syncing) ? (
        <ActivityIndicator style={styles.spinner} />
      ) : data?.empty ? (
        <View style={styles.emptyBox}>
          <ThemedText type="subtitle" style={styles.emptyTitle}>
            Your library is empty
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.emptyText}>
            {syncing ? 'Syncing with your server…' : 'Pull down to sync with your Grimmory server.'}
          </ThemedText>
          {!syncing ? (
            <Pressable onPress={sync} style={styles.syncButton}>
              <ThemedText style={styles.syncButtonText}>Sync Now</ThemedText>
            </Pressable>
          ) : null}
        </View>
      ) : data ? (
        <View style={styles.sections}>
          <ShelfRow title="Continue Reading" books={data.continueReading} coverWidth={150} />
          {data.genres.length > 0 ? <GenreChips genres={data.genres} /> : null}
          {data.sections.map((s) => (
            <ShelfRow
              key={s.key}
              title={s.title}
              subtitle={s.subtitle}
              books={s.books}
              seeAllHref={s.category ? { pathname: '/library', params: { category: s.category } } : undefined}
            />
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.three },
  sections: { gap: Spacing.five },
  notice: { paddingHorizontal: Spacing.four },
  spinner: { marginTop: Spacing.six },
  emptyBox: {
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    marginTop: Spacing.six,
  },
  emptyTitle: { fontSize: 24, lineHeight: 30, textAlign: 'center' },
  emptyText: { textAlign: 'center' },
  syncButton: {
    backgroundColor: '#e8734a',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  syncButtonText: { color: '#fff', fontWeight: '600' },
  lucky: {
    backgroundColor: '#e8734a',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    marginBottom: 4,
  },
  luckyText: { color: '#fff', fontWeight: '600', fontSize: 15 },
});
