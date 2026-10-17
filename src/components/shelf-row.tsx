import { Link, type Href } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { BookCard } from '@/components/book-card';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { AppBookSummary } from '@/lib/types';

interface Props {
  title: string;
  subtitle?: string;
  books: AppBookSummary[];
  coverWidth?: number;
  seeAllHref?: Href;
}

export function ShelfRow({ title, subtitle, books, coverWidth = 132, seeAllHref }: Props) {
  if (books.length === 0) return null;
  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <ThemedText style={styles.title}>{title}</ThemedText>
          {subtitle ? (
            <ThemedText type="small" themeColor="textSecondary">
              {subtitle}
            </ThemedText>
          ) : null}
        </View>
        {seeAllHref ? (
          <Link href={seeAllHref} asChild>
            <Pressable hitSlop={8}>
              <ThemedText type="small" style={styles.seeAll}>
                See All
              </ThemedText>
            </Pressable>
          </Link>
        ) : null}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.row, styles.rowTop]}
      >
        {books.map((b) => (
          <BookCard key={b.id} book={b} width={coverWidth} />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.two },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
  },
  headerText: { gap: 2, flex: 1 },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  seeAll: { color: '#e8734a', fontWeight: '600' },
  row: {
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
    paddingBottom: Spacing.two,
  },
  rowTop: { alignItems: 'flex-start' },
});
