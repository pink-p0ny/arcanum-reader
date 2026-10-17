import { useQuery } from '@tanstack/react-query';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getBooks } from '@/lib/db';
import { DEFAULT_HIDDEN_GENRES, hiddenGenresStore, setHiddenGenres, toggleHiddenGenre } from '@/lib/genres';
import { hiddenGenreSet, isHiddenGenre, normalizeGenre } from '@/lib/genres-core';
import { useStore } from '@/lib/store';
import { genreAffinity } from '@/lib/taste';

interface Props {
  visible: boolean;
  onClose: () => void;
}

/** Every genre in the library with a switch; off means it is left out of Home and Surprise Me. */
export function HiddenGenresSheet({ visible, onClose }: Props) {
  const theme = useTheme();
  const hidden = useStore(hiddenGenresStore);
  const genres = useQuery({
    queryKey: ['genre-counts'],
    queryFn: async () => [...genreAffinity(await getBooks({ sort: 'title' })).counts.entries()],
    enabled: visible,
  });

  const set = hiddenGenreSet(hidden);
  // Library genres by count, then hidden names the library no longer has, so they can still be unhidden.
  const inLibrary = (genres.data ?? []).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const seen = new Set(inLibrary.map(([name]) => normalizeGenre(name)));
  const rows: { name: string; count: number }[] = [
    ...inLibrary.map(([name, count]) => ({ name, count })),
    ...hidden.filter((h) => !seen.has(normalizeGenre(h))).map((name) => ({ name, count: 0 })),
  ];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <SafeAreaView style={[styles.screen, { backgroundColor: theme.background }]} edges={['bottom']}>
        <View style={styles.header}>
          <Pressable onPress={() => setHiddenGenres(DEFAULT_HIDDEN_GENRES)} hitSlop={8}>
            <ThemedText style={styles.link}>Defaults</ThemedText>
          </Pressable>
          <ThemedText style={styles.headerTitle}>Browse Genres</ThemedText>
          <Pressable onPress={onClose} hitSlop={8}>
            <ThemedText style={styles.done}>Done</ThemedText>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
            Switch off tags that say nothing about taste, like Fiction or Adult. They stay on the books but
            leave Browse by Genre, the shelves on Home and Surprise Me.
          </ThemedText>
          <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
            {rows.length === 0 ? (
              <ThemedText themeColor="textSecondary" style={styles.hint}>
                {genres.isLoading ? 'Loading…' : 'No genres in your library yet.'}
              </ThemedText>
            ) : (
              rows.map((g) => (
                <View key={g.name} style={styles.row}>
                  <View style={styles.rowText}>
                    <ThemedText numberOfLines={1}>{g.name}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {g.count === 0 ? 'Not in your library' : `${g.count} ${g.count === 1 ? 'book' : 'books'}`}
                    </ThemedText>
                  </View>
                  <Switch value={!isHiddenGenre(g.name, set)} onValueChange={() => toggleHiddenGenre(g.name)} />
                </View>
              ))
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.three,
  },
  headerTitle: { fontWeight: '600', fontSize: 17 },
  done: { color: '#e8734a', fontWeight: '700', fontSize: 17 },
  link: { color: '#e8734a', fontSize: 17 },
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  hint: { lineHeight: 20 },
  card: { borderRadius: 14, paddingHorizontal: Spacing.three },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    minHeight: 56,
    paddingVertical: 8,
  },
  rowText: { flex: 1, gap: 2 },
});
