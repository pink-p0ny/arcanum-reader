import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { BookCover } from '@/components/book-cover';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { aiStore } from '@/lib/ai';
import { bestRating } from '@/lib/home';
import { authorsLine } from '@/lib/library';
import { drawLucky, skipBook, type LuckyPick } from '@/lib/lucky';
import { useStore } from '@/lib/store';

interface Props {
  visible: boolean;
  onClose: () => void;
}

/** "Surprise me": one book to start right now, with a reason, and a button to try another. */
export function LuckySheet({ visible, onClose }: Props) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      {visible ? <LuckyBody onClose={onClose} /> : null}
    </Modal>
  );
}

function LuckyBody({ onClose }: { onClose: () => void }) {
  const theme = useTheme();
  const router = useRouter();
  const ai = useStore(aiStore, (s) => s.mode === 'byok' && s.hasKey);
  const [pick, setPick] = useState<LuckyPick | null | undefined>(undefined);
  const [drawing, setDrawing] = useState(false);
  const [tries, setTries] = useState(0);
  const [mood, setMood] = useState('');

  useEffect(() => {
    let live = true;
    drawLucky().then((p) => {
      if (live) setPick(p);
    });
    return () => {
      live = false;
    };
  }, []);

  const redraw = async (skipCurrent: boolean) => {
    if (drawing) return;
    setDrawing(true);
    if (skipCurrent && pick) await skipBook(pick.book.id);
    const next = await drawLucky(pick?.book.id ?? null, { mood });
    setPick(next);
    setTries((n) => n + 1);
    setDrawing(false);
  };

  const start = () => {
    if (!pick) return;
    onClose();
    router.push({ pathname: '/read/[id]', params: { id: String(pick.book.id) } });
  };

  const details = () => {
    if (!pick) return;
    onClose();
    router.push({ pathname: '/book/[id]', params: { id: String(pick.book.id) } });
  };

  const rating = pick ? bestRating(pick.book) : 0;

  return (
    <View style={[styles.sheet, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <ThemedText type="subtitle">Surprise Me</ThemedText>
        <Pressable onPress={onClose} hitSlop={10}>
          <ThemedText style={styles.link}>Close</ThemedText>
        </Pressable>
      </View>

      {pick === undefined ? (
        <ActivityIndicator style={styles.spinner} />
      ) : pick === null ? (
        <View style={styles.empty}>
          <ThemedText type="subtitle" style={styles.center}>
            Nothing left to draw
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.center}>
            Every unread book has been skipped recently. Skips expire after sixty days.
          </ThemedText>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {ai ? (
            <View style={[styles.moodRow, { backgroundColor: theme.backgroundElement }]}>
              <TextInput
                value={mood}
                onChangeText={setMood}
                placeholder="In the mood for… (optional)"
                placeholderTextColor={theme.textSecondary}
                style={[styles.moodInput, { color: theme.text }]}
                returnKeyType="search"
                onSubmitEditing={() => redraw(false)}
                editable={!drawing}
              />
              <Pressable onPress={() => redraw(false)} disabled={drawing} hitSlop={8}>
                <ThemedText style={[styles.link, drawing && styles.disabled]}>Ask</ThemedText>
              </Pressable>
            </View>
          ) : null}

          <View style={[styles.cover, { opacity: drawing ? 0.4 : 1 }]}>
            <BookCover book={pick.book} width={180} />
          </View>
          <ThemedText type="subtitle" style={styles.center}>
            {pick.book.title}
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.center}>
            {authorsLine(pick.book)}
            {pick.book.seriesName
              ? ` · ${pick.book.seriesName}${pick.book.seriesNumber ? ` #${pick.book.seriesNumber}` : ''}`
              : ''}
          </ThemedText>
          {rating > 0 || pick.book.categories?.length ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
              {rating > 0 ? `★ ${rating.toFixed(1)}` : ''}
              {rating > 0 && pick.book.categories?.length ? ' · ' : ''}
              {pick.book.categories?.slice(0, 3).join(', ') ?? ''}
            </ThemedText>
          ) : null}

          <View style={[styles.why, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.whyTitle}>
              {pick.source === 'ai' ? 'Picked for you by Claude' : 'Why this one'}
            </ThemedText>
            {pick.reasons.map((r) => (
              <ThemedText key={r} type="small">
                {pick.source === 'ai' ? r : `· ${r}`}
              </ThemedText>
            ))}
            {pick.aiError ? (
              <ThemedText type="small" themeColor="textSecondary" style={styles.error}>
                AI pick unavailable ({pick.aiError}). This one is from the local draw.
              </ThemedText>
            ) : null}
          </View>

          <Pressable onPress={start} disabled={drawing} style={[styles.primary, drawing && styles.disabled]}>
            <ThemedText style={styles.primaryText}>Start Reading</ThemedText>
          </Pressable>
          <Pressable
            onPress={() => redraw(true)}
            disabled={drawing}
            style={[
              styles.secondary,
              { backgroundColor: theme.backgroundElement },
              drawing && styles.disabled,
            ]}
          >
            <ThemedText style={styles.secondaryText}>
              {drawing ? 'Drawing…' : tries ? 'Try Another' : 'Not Today, Try Another'}
            </ThemedText>
          </Pressable>
          <Pressable onPress={details} hitSlop={8} style={styles.tertiary}>
            <ThemedText type="small" themeColor="textSecondary">
              See book details
            </ThemedText>
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  link: { color: '#e8734a', fontWeight: '600' },
  spinner: { marginTop: Spacing.six },
  empty: { padding: Spacing.five, gap: Spacing.two },
  body: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.five,
    paddingBottom: Spacing.six,
  },
  moodRow: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: 4,
  },
  moodInput: { flex: 1, fontSize: 16, paddingVertical: 8 },
  cover: { marginVertical: Spacing.three },
  center: { textAlign: 'center' },
  why: {
    alignSelf: 'stretch',
    borderRadius: 12,
    padding: Spacing.three,
    gap: 2,
    marginTop: Spacing.three,
  },
  whyTitle: { textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 2 },
  error: { marginTop: 4, fontStyle: 'italic' },
  primary: {
    alignSelf: 'stretch',
    alignItems: 'center',
    backgroundColor: '#e8734a',
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: Spacing.three,
  },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 17 },
  secondary: {
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 12,
  },
  secondaryText: { fontWeight: '600', fontSize: 17, color: '#e8734a' },
  tertiary: { paddingVertical: Spacing.two },
  disabled: { opacity: 0.5 },
});
