import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { TocItem } from '@/components/reader/reader-webview';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface Props {
  visible: boolean;
  toc: TocItem[];
  currentLabel: string | null;
  onSelect: (href: string) => void;
  onClose: () => void;
}

function flatten(items: TocItem[], depth = 0): { label: string; href: string | null; depth: number }[] {
  return items.flatMap((it) => [
    { label: it.label, href: it.href, depth },
    ...flatten(it.children ?? [], depth + 1),
  ]);
}

export function TocSheet({ visible, toc, currentLabel, onSelect, onClose }: Props) {
  const theme = useTheme();
  const rows = flatten(toc);
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <SafeAreaView style={[styles.screen, { backgroundColor: theme.background }]} edges={['bottom']}>
        <View style={styles.header}>
          <ThemedText style={styles.headerTitle}>Contents</ThemedText>
          <Pressable onPress={onClose} hitSlop={8}>
            <ThemedText style={styles.done}>Done</ThemedText>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.list}>
          {rows.length === 0 ? (
            <ThemedText themeColor="textSecondary" style={styles.empty}>
              This book has no table of contents.
            </ThemedText>
          ) : (
            rows.map((r, i) => {
              const active = !!currentLabel && r.label === currentLabel;
              return (
                <Pressable
                  key={`${r.href}-${i}`}
                  disabled={!r.href}
                  onPress={() => r.href && onSelect(r.href)}
                  style={({ pressed }) => [
                    styles.row,
                    {
                      paddingLeft: Spacing.three + r.depth * 18,
                      backgroundColor: pressed ? theme.backgroundElement : 'transparent',
                    },
                  ]}
                >
                  <ThemedText style={[active && styles.active, r.depth > 0 && styles.sub]} numberOfLines={2}>
                    {r.label || 'Untitled'}
                  </ThemedText>
                </Pressable>
              );
            })
          )}
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
  list: { paddingBottom: Spacing.six },
  row: { paddingVertical: 12, paddingRight: Spacing.three },
  active: { color: '#e8734a', fontWeight: '700' },
  sub: { fontWeight: '400' },
  empty: { padding: Spacing.four, textAlign: 'center' },
});
