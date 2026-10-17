import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BookCard } from '@/components/book-card';
import { LargeTitle } from '@/components/large-title';
import { binderyStore, ensureBinderyLoaded } from '@/lib/bindery';
import { useStore } from '@/lib/store';
import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { LibrarySort } from '@/lib/db';
import { useLibrary, useLibrarySync } from '@/lib/library';

const SORTS: { key: LibrarySort; label: string }[] = [
  { key: 'title', label: 'Title' },
  { key: 'recent', label: 'Recent' },
  { key: 'added', label: 'Added' },
];

export default function LibraryScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const binderyReady = useStore(binderyStore, (b) => !!b.url && b.hasKey);
  useEffect(() => {
    ensureBinderyLoaded();
  }, []);
  const { width } = useWindowDimensions();
  const { category } = useLocalSearchParams<{ category?: string }>();
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<LibrarySort>('title');
  const { data, refetch } = useLibrary({
    search: search.trim() || undefined,
    sort,
  });
  const { sync, syncing } = useLibrarySync();

  const books = useMemo(
    () => (category ? (data ?? []).filter((b) => (b.categories ?? []).includes(category)) : (data ?? [])),
    [data, category],
  );

  const gap = Spacing.three;
  const horizontal = Spacing.four;
  const columns = Math.max(2, Math.floor((width - horizontal * 2 + gap) / (150 + gap)));
  const coverWidth = Math.floor((width - horizontal * 2 - gap * (columns - 1)) / columns);

  return (
    <FlatList
      key={columns}
      style={{ backgroundColor: theme.background }}
      data={books}
      numColumns={columns}
      keyExtractor={(b) => String(b.id)}
      columnWrapperStyle={{ gap }}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: insets.top,
          paddingBottom: insets.bottom + BottomTabInset + Spacing.four,
        },
      ]}
      refreshControl={
        <RefreshControl
          refreshing={syncing}
          onRefresh={async () => {
            await sync();
            refetch();
          }}
        />
      }
      ListHeaderComponent={
        <View style={styles.header}>
          <LargeTitle
            title={category ?? 'Library'}
            right={
              category ? (
                <Pressable onPress={() => router.setParams({ category: undefined })} hitSlop={8}>
                  <ThemedText type="small" style={styles.accent}>
                    Clear
                  </ThemedText>
                </Pressable>
              ) : binderyReady ? (
                <Pressable onPress={() => router.push('/request')} hitSlop={8}>
                  <ThemedText type="small" style={styles.accent}>
                    + Request
                  </ThemedText>
                </Pressable>
              ) : undefined
            }
          />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search titles and authors"
            placeholderTextColor={theme.textSecondary}
            clearButtonMode="while-editing"
            autoCorrect={false}
            style={[styles.search, { backgroundColor: theme.backgroundElement, color: theme.text }]}
          />
          <View style={styles.sortRow}>
            {SORTS.map((s) => (
              <Pressable
                key={s.key}
                onPress={() => setSort(s.key)}
                style={[
                  styles.sortChip,
                  {
                    backgroundColor: sort === s.key ? theme.backgroundSelected : theme.backgroundElement,
                  },
                ]}
              >
                <ThemedText type="small">{s.label}</ThemedText>
              </Pressable>
            ))}
            <ThemedText type="small" themeColor="textSecondary" style={styles.count}>
              {books.length} {books.length === 1 ? 'book' : 'books'}
            </ThemedText>
          </View>
        </View>
      }
      ListEmptyComponent={
        <ThemedText themeColor="textSecondary" style={styles.empty}>
          {syncing ? 'Syncing…' : search ? 'No matches.' : 'No books yet. Pull to sync.'}
        </ThemedText>
      }
      renderItem={({ item }) => <BookCard book={item} width={coverWidth} />}
    />
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: Spacing.four, gap: Spacing.four },
  header: {
    gap: Spacing.two,
    marginBottom: Spacing.two,
    marginHorizontal: -Spacing.four,
  },
  search: {
    marginHorizontal: Spacing.four,
    height: 40,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 16,
  },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    marginTop: Spacing.one,
  },
  sortChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  count: { marginLeft: 'auto' },
  accent: { color: '#e8734a', fontWeight: '600' },
  empty: { textAlign: 'center', marginTop: Spacing.six },
});
