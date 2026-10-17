import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { BookCover } from '@/components/book-cover';
import { ThemedText } from '@/components/themed-text';
import { authorsLine } from '@/lib/library';
import type { AppBookSummary } from '@/lib/types';

interface Props {
  book: AppBookSummary;
  width: number;
  showProgress?: boolean;
}

const TITLE_LINE = 18;
const AUTHOR_LINE = 18;

/** Height of a card for a given cover width, so shelves and grids can reserve uniform rows. */
export const bookCardHeight = (width: number) =>
  Math.round(width * 1.5) + 9 + 8 + TITLE_LINE * 2 + AUTHOR_LINE;

export function BookCard({ book, width, showProgress = true }: Props) {
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/book/[id]', params: { id: String(book.id) } })}
      // Width must be a plain style object: Link/Slot wrappers drop function styles, which let long
      // titles stretch cards inside horizontal shelves.
      style={[styles.card, { width }]}
    >
      {({ pressed }) => (
        <View style={[styles.inner, { width, opacity: pressed ? 0.75 : 1 }]}>
          <BookCover book={book} width={width} showProgress={showProgress} />
          {book.editions && book.editions.length > 1 ? (
            <View style={styles.formats} pointerEvents="none">
              <ThemedText style={styles.formatsText}>{book.editions.length} formats</ThemedText>
            </View>
          ) : null}
          <View style={[styles.meta, { width }]}>
            <ThemedText type="small" numberOfLines={2} style={styles.title}>
              {book.title}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.author}>
              {authorsLine(book)}
            </ThemedText>
          </View>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { alignSelf: 'flex-start' },
  inner: { alignItems: 'stretch' },
  meta: { marginTop: 8, gap: 0 },
  formats: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
  },
  formatsText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  title: { fontWeight: '600', lineHeight: TITLE_LINE, minHeight: TITLE_LINE * 2 },
  author: { lineHeight: AUTHOR_LINE },
});
