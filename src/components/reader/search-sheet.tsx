import { useEffect, useRef } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface SearchHit {
  cfi: string;
  pre: string;
  match: string;
  post: string;
}

export interface SearchGroup {
  label: string;
  items: SearchHit[];
}

export interface SearchState {
  query: string;
  groups: SearchGroup[];
  /** 0..1 while the book is being scanned; null once done. */
  progress: number | null;
}

interface Props {
  visible: boolean;
  state: SearchState | null;
  onSearch: (query: string) => void;
  onSelect: (cfi: string) => void;
  onClear: () => void;
  onClose: () => void;
}

/** Find text anywhere in the book; results are grouped by chapter and highlighted on the page. */
export function SearchSheet({ visible, state, onSearch, onSelect, onClear, onClose }: Props) {
  const theme = useTheme();
  const input = useRef<TextInput>(null);
  const draft = useRef(state?.query ?? '');

  useEffect(() => {
    if (visible) setTimeout(() => input.current?.focus(), 250);
  }, [visible]);

  const total = state?.groups.reduce((n, g) => n + g.items.length, 0) ?? 0;
  const scanning = state?.progress != null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <SafeAreaView style={[styles.screen, { backgroundColor: theme.background }]} edges={['bottom']}>
        <View style={styles.header}>
          <ThemedText style={styles.headerTitle}>Search</ThemedText>
          <Pressable onPress={onClose} hitSlop={8}>
            <ThemedText style={styles.done}>Done</ThemedText>
          </Pressable>
        </View>
        <View style={[styles.searchRow, { backgroundColor: theme.backgroundElement }]}>
          <TextInput
            ref={input}
            defaultValue={state?.query ?? ''}
            onChangeText={(t) => (draft.current = t)}
            onSubmitEditing={() => onSearch(draft.current.trim())}
            placeholder="Search in this book"
            placeholderTextColor={theme.textSecondary}
            returnKeyType="search"
            autoCorrect={false}
            clearButtonMode="while-editing"
            style={[styles.input, { color: theme.text }]}
          />
          {state ? (
            <Pressable onPress={onClear} hitSlop={8}>
              <ThemedText type="small" style={styles.clear}>
                Clear
              </ThemedText>
            </Pressable>
          ) : null}
        </View>

        {state ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.summary}>
            {scanning
              ? `Searching… ${Math.round((state.progress ?? 0) * 100)}%`
              : total === 0
                ? `Nothing found for “${state.query}”`
                : `${total} ${total === 1 ? 'match' : 'matches'} for “${state.query}”`}
          </ThemedText>
        ) : null}
        {scanning && total === 0 ? <ActivityIndicator style={styles.spinner} /> : null}

        <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
          {state?.groups.map((g, gi) => (
            <View key={`${g.label}-${gi}`}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.group} numberOfLines={1}>
                {g.label || 'Untitled section'}
              </ThemedText>
              {g.items.map((h, i) => (
                <Pressable
                  key={`${h.cfi}-${i}`}
                  onPress={() => onSelect(h.cfi)}
                  style={({ pressed }) => [
                    styles.row,
                    { backgroundColor: pressed ? theme.backgroundElement : 'transparent' },
                  ]}
                >
                  <ThemedText numberOfLines={3} style={styles.excerpt}>
                    <ThemedText themeColor="textSecondary">{h.pre}</ThemedText>
                    <ThemedText style={styles.match}>{h.match}</ThemedText>
                    <ThemedText themeColor="textSecondary">{h.post}</ThemedText>
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          ))}
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
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginHorizontal: Spacing.three,
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
  },
  input: { flex: 1, fontSize: 17, paddingVertical: 10 },
  clear: { color: '#e8734a', fontWeight: '600' },
  summary: { paddingHorizontal: Spacing.four, paddingTop: Spacing.two },
  spinner: { marginTop: Spacing.four },
  list: { paddingBottom: Spacing.six, paddingTop: Spacing.two },
  group: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  row: { paddingVertical: 10, paddingHorizontal: Spacing.four },
  excerpt: { fontSize: 15, lineHeight: 21 },
  match: { fontWeight: '700', color: '#e8734a' },
});
