import { useQuery } from '@tanstack/react-query';
import { useStore } from '@/lib/store';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BookCover } from '@/components/book-cover';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { isOfflineError } from '@/lib/api';
import { getProvider } from '@/lib/provider';
import { getBook, getBooks, type LocalAnnotation } from '@/lib/db';
import { deleteDownload, downloadBook, downloadsStore, formatBytes, localBookFile } from '@/lib/downloads';
import { siblingEditions } from '@/lib/editions';
import { pickReadableFile } from '@/lib/formats';
import { authorsLine } from '@/lib/library';
import { shareHighlights } from '@/lib/export';
import { loadAnnotations } from '@/lib/sync';
import type { AppBookDetail, AppBookSummary } from '@/lib/types';

function stripHtml(s?: string) {
  return (s ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function Rating({ label, value, count }: { label: string; value?: number; count?: number }) {
  if (!value) return null;
  return (
    <View style={styles.rating}>
      <ThemedText style={styles.ratingValue}>★ {value.toFixed(1)}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
        {count ? ` · ${count.toLocaleString()}` : ''}
      </ThemedText>
    </View>
  );
}

export default function BookScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const bookId = Number(id);
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const wide = width >= 700;
  const [expanded, setExpanded] = useState(false);

  const cached = useQuery({
    queryKey: ['book', bookId],
    queryFn: () => getBook(bookId),
  });
  const detail = useQuery({
    queryKey: ['bookDetail', bookId],
    queryFn: () => getProvider(bookId).bookDetail(bookId),
    retry: false,
  });
  const download = useQuery({
    queryKey: ['download', bookId],
    queryFn: () => localBookFile(bookId),
  });
  const annotations = useQuery({
    queryKey: ['annotations', bookId],
    queryFn: () => loadAnnotations(bookId),
  });
  const editions = useQuery({
    queryKey: ['editions', bookId],
    queryFn: async () => siblingEditions(bookId, await getBooks({ sort: 'title' })),
  });
  const dl = useStore(downloadsStore, (s) => s[bookId]);

  const book: (AppBookSummary & Partial<AppBookDetail>) | null | undefined = detail.data
    ? { ...(cached.data ?? {}), ...detail.data }
    : cached.data;

  if (!book) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        {cached.isLoading ? <ActivityIndicator /> : <ThemedText>Book not found.</ThemedText>}
      </View>
    );
  }

  const readable = pickReadableFile(detail.data?.files, {
    id: book.primaryFileId,
    type: book.primaryFileType,
    name: book.primaryFileName,
  });
  const isEpub = !!readable;
  const downloaded = !!download.data;
  const progress = book.readProgress ?? 0;

  const startDownload = async () => {
    try {
      await downloadBook(bookId, readable?.id ?? book.primaryFileId, readable?.type);
      download.refetch();
    } catch (e) {
      Alert.alert('Download failed', isOfflineError(e) ? 'You appear to be offline.' : (e as Error).message);
    }
  };

  const openReader = () => router.push({ pathname: '/read/[id]', params: { id: String(bookId) } });

  const primaryLabel = downloaded
    ? progress > 0 && progress < 99
      ? 'Continue Reading'
      : 'Read'
    : 'Download & Read';
  const primaryAction = downloaded ? openReader : openReader; // the reader downloads on demand if needed

  const description = stripHtml(book.description);
  const coverWidth = wide ? 260 : Math.min(220, width * 0.5);

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: insets.top + 56,
          paddingBottom: insets.bottom + Spacing.six,
        },
      ]}
    >
      <View style={[styles.hero, wide && styles.heroWide]}>
        <BookCover book={book} width={coverWidth} />
        <View style={[styles.heroText, wide && styles.heroTextWide]}>
          <ThemedText style={styles.title}>{book.title}</ThemedText>
          {book.subtitle ? <ThemedText themeColor="textSecondary">{book.subtitle}</ThemedText> : null}
          <ThemedText style={styles.authors}>{authorsLine(book)}</ThemedText>
          {book.seriesName ? (
            <ThemedText type="small" themeColor="textSecondary">
              {book.seriesName}
              {book.seriesNumber ? ` #${book.seriesNumber}` : ''}
            </ThemedText>
          ) : null}

          <View style={styles.ratings}>
            <Rating label="Goodreads" value={book.goodreadsRating} count={book.goodreadsReviewCount} />
            <Rating label="Amazon" value={book.amazonRating} count={book.amazonReviewCount} />
            <Rating label="Hardcover" value={book.hardcoverRating} count={book.hardcoverReviewCount} />
          </View>

          {isEpub ? (
            <View style={styles.actions}>
              <Pressable
                onPress={primaryAction}
                disabled={!!dl && dl.status === 'downloading'}
                style={({ pressed }) => [styles.primary, { opacity: pressed ? 0.8 : 1 }]}
              >
                <ThemedText style={styles.primaryText}>
                  {dl?.status === 'downloading'
                    ? `Downloading ${Math.round(dl.progress * 100)}%`
                    : primaryLabel}
                </ThemedText>
              </Pressable>
              {downloaded ? (
                <Pressable
                  onPress={() =>
                    Alert.alert('Remove download?', 'You can download it again any time.', [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Remove',
                        style: 'destructive',
                        onPress: async () => {
                          await deleteDownload(bookId);
                          download.refetch();
                        },
                      },
                    ])
                  }
                  style={[styles.secondary, { backgroundColor: theme.backgroundElement }]}
                >
                  <ThemedText type="small">Remove Download</ThemedText>
                </Pressable>
              ) : (
                <Pressable
                  onPress={startDownload}
                  disabled={!!dl && dl.status === 'downloading'}
                  style={[styles.secondary, { backgroundColor: theme.backgroundElement }]}
                >
                  <ThemedText type="small">
                    Download Only
                    {book.fileSizeKb ? ` · ${formatBytes(book.fileSizeKb * 1024)}` : ''}
                  </ThemedText>
                </Pressable>
              )}
            </View>
          ) : (
            <ThemedText themeColor="textSecondary">
              This book is {book.primaryFileType ?? 'in a format'}; the reader opens EPUB, MOBI, AZW3 and FB2.
              PDF and comics are not supported yet.
            </ThemedText>
          )}

          {(editions.data ?? []).length > 0 ? (
            <View style={styles.editionsRow}>
              <ThemedText type="small" themeColor="textSecondary">
                Also in your library as
              </ThemedText>
              {editions.data!.map((e) => (
                <Pressable
                  key={e.id}
                  onPress={() => router.push({ pathname: '/book/[id]', params: { id: String(e.id) } })}
                  hitSlop={6}
                  style={[styles.editionChip, { backgroundColor: theme.backgroundElement }]}
                >
                  <ThemedText type="small" style={styles.editionText}>
                    {e.type}
                  </ThemedText>
                </Pressable>
              ))}
              {readable ? (
                <ThemedText type="small" themeColor="textSecondary">
                  · this one is {readable.type}
                </ThemedText>
              ) : null}
            </View>
          ) : null}

          {progress > 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              {Math.round(progress)}% read
            </ThemedText>
          ) : null}
          {dl?.status === 'error' ? <ThemedText style={{ color: '#d33' }}>{dl.message}</ThemedText> : null}
        </View>
      </View>

      {description ? (
        <Pressable onPress={() => setExpanded((v) => !v)} style={styles.block}>
          <ThemedText style={styles.h2}>About</ThemedText>
          <ThemedText numberOfLines={expanded ? undefined : 6} style={styles.body}>
            {description}
          </ThemedText>
          {!expanded && description.length > 300 ? (
            <ThemedText type="small" style={styles.more}>
              more
            </ThemedText>
          ) : null}
        </Pressable>
      ) : null}

      <View style={styles.block}>
        <View style={styles.metaRow}>
          {book.publisher ? <Meta label="Publisher" value={book.publisher} /> : null}
          {book.publishedDate ? <Meta label="Published" value={book.publishedDate} /> : null}
          {book.pageCount ? <Meta label="Pages" value={String(book.pageCount)} /> : null}
          {book.language ? <Meta label="Language" value={book.language.toUpperCase()} /> : null}
        </View>
        {(book.categories ?? []).length > 0 ? (
          <View style={styles.chips}>
            {(book.categories ?? []).map((c) => (
              <Pressable
                key={c}
                onPress={() => router.push({ pathname: '/library', params: { category: c } })}
                style={[styles.chip, { backgroundColor: theme.backgroundElement }]}
              >
                <ThemedText type="small">{c}</ThemedText>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>

      <View style={styles.block}>
        <View style={styles.h2Row}>
          <ThemedText style={styles.h2}>
            Highlights & Notes
            {annotations.data ? ` · ${annotations.data.length}` : ''}
          </ThemedText>
          {book && (annotations.data ?? []).length > 0 ? (
            <Pressable
              hitSlop={8}
              onPress={() =>
                shareHighlights(book, annotations.data ?? []).catch((e) =>
                  Alert.alert('Could not share', (e as Error).message),
                )
              }
            >
              <ThemedText type="small" style={styles.accent}>
                Share
              </ThemedText>
            </Pressable>
          ) : null}
        </View>
        {annotations.isLoading ? (
          <ActivityIndicator />
        ) : (annotations.data ?? []).length === 0 ? (
          <ThemedText themeColor="textSecondary">
            Select text while reading to highlight it or add a note.
          </ThemedText>
        ) : (
          (annotations.data ?? []).map((a) => (
            <AnnotationRow
              key={a.localId}
              a={a}
              onPress={() =>
                router.push({
                  pathname: '/read/[id]',
                  params: { id: String(bookId), cfi: a.cfi },
                })
              }
            />
          ))
        )}
      </View>
    </ScrollView>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.meta}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="small">{value}</ThemedText>
    </View>
  );
}

function AnnotationRow({ a, onPress }: { a: LocalAnnotation; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.annotation,
        {
          backgroundColor: theme.backgroundElement,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <View style={[styles.swatch, { backgroundColor: a.color ?? '#FACC15' }]} />
      <View style={styles.annotationBody}>
        {a.chapterTitle ? (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {a.chapterTitle}
          </ThemedText>
        ) : null}
        <ThemedText numberOfLines={4} style={styles.quote}>
          {a.text}
        </ThemedText>
        {a.note ? <ThemedText type="small">{a.note}</ThemedText> : null}
        {a.pending ? (
          <ThemedText type="small" themeColor="textSecondary">
            Waiting to sync
          </ThemedText>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: {
    paddingHorizontal: Spacing.four,
    gap: Spacing.five,
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth + 200,
  },
  hero: { alignItems: 'center', gap: Spacing.four },
  heroWide: { flexDirection: 'row', alignItems: 'flex-start' },
  heroText: { gap: Spacing.two, alignItems: 'center', width: '100%' },
  heroTextWide: { flex: 1, alignItems: 'flex-start' },
  title: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
    textAlign: 'center',
  },
  authors: { fontSize: 17, color: '#e8734a' },
  ratings: {
    flexDirection: 'row',
    gap: Spacing.four,
    flexWrap: 'wrap',
    marginTop: Spacing.one,
  },
  rating: { alignItems: 'center', gap: 2 },
  ratingValue: { fontSize: 18, fontWeight: '600' },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.two,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  primary: {
    backgroundColor: '#e8734a',
    paddingHorizontal: 22,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  secondary: {
    paddingHorizontal: 16,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  block: { gap: Spacing.two },
  h2: { fontSize: 20, lineHeight: 26, fontWeight: '700' },
  editionsRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  editionChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  editionText: { fontWeight: '700' },
  h2Row: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  accent: { color: '#e8734a', fontWeight: '600' },
  body: { fontWeight: '400' },
  more: { color: '#e8734a', fontWeight: '600' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.four },
  meta: { gap: 2 },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  annotation: {
    flexDirection: 'row',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: 12,
  },
  swatch: { width: 4, borderRadius: 2 },
  annotationBody: { flex: 1, gap: 4 },
  quote: { fontStyle: 'italic', fontWeight: '400' },
});
