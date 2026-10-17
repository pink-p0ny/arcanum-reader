import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { HIGHLIGHT_COLORS, HIGHLIGHT_STYLES } from '@/components/reader/highlight-colors';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { AnnotationStyle } from '@/lib/types';

interface Props {
  colors: { bg: string; fg: string };
  /** Distance from the bottom edge, so the bar clears the reader's own bottom bar when it is shown. */
  bottomOffset: number;
  onHighlight: (color: string, style: AnnotationStyle) => void;
  onNote: () => void;
  onCancel: () => void;
}

/**
 * Toolbar shown while text is selected. The system edit menu (Copy, Look Up, Translate…) floats next to
 * the selection; this bar adds what the system cannot: highlight colours and notes that sync to Grimmory.
 */
export function SelectionBar({ colors, bottomOffset, onHighlight, onNote, onCancel }: Props) {
  const [style, setStyle] = useState<AnnotationStyle>('highlight');
  return (
    <View style={[styles.bar, { backgroundColor: colors.bg, bottom: bottomOffset, shadowColor: '#000' }]}>
      <ThemedText type="small" style={[styles.label, { color: colors.fg }]}>
        Tap a colour to highlight
      </ThemedText>
      <View style={styles.row}>
        {HIGHLIGHT_COLORS.map((c) => (
          <Pressable
            key={c.value}
            accessibilityLabel={`${c.name} ${style}`}
            onPress={() => onHighlight(c.value, style)}
            hitSlop={6}
            style={[styles.swatch, { backgroundColor: c.value }]}
          />
        ))}
      </View>
      <View style={styles.row}>
        <ThemedText type="small" style={[styles.label, { color: colors.fg }]}>
          Style
        </ThemedText>
        {HIGHLIGHT_STYLES.map((s) => (
          <Pressable
            key={s.value}
            onPress={() => setStyle(s.value)}
            style={[styles.pill, style === s.value && styles.pillActive]}
          >
            <ThemedText type="small" style={{ color: style === s.value ? '#fff' : colors.fg }}>
              {s.label}
            </ThemedText>
          </Pressable>
        ))}
      </View>
      <View style={styles.row}>
        <Pressable onPress={onNote} style={styles.action}>
          <ThemedText type="small" style={styles.actionText}>
            Add Note
          </ThemedText>
        </Pressable>
        <Pressable onPress={onCancel} style={[styles.action, styles.actionLast]}>
          <ThemedText type="small" style={{ color: colors.fg }}>
            Cancel
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: Spacing.three,
    right: Spacing.three,
    maxWidth: 520,
    alignSelf: 'center',
    borderRadius: 16,
    padding: Spacing.three,
    gap: Spacing.two,
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flexWrap: 'wrap',
  },
  swatch: { width: 30, height: 30, borderRadius: 15 },
  label: { opacity: 0.6, marginRight: 2 },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: 'rgba(128,128,128,0.15)',
  },
  pillActive: { backgroundColor: '#e8734a' },
  action: { paddingVertical: 6, paddingRight: Spacing.three },
  actionLast: { marginLeft: 'auto', paddingRight: 0 },
  actionText: { color: '#e8734a', fontWeight: '600' },
});
