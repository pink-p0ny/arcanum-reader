import { Pressable, StyleSheet, View } from 'react-native';

import { HIGHLIGHT_COLORS, HIGHLIGHT_STYLES } from '@/components/reader/highlight-colors';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { LocalAnnotation } from '@/lib/db';
import type { AnnotationStyle } from '@/lib/types';

interface Props {
  annotation: LocalAnnotation;
  colors: { bg: string; fg: string };
  onChange: (patch: { color?: string; style?: AnnotationStyle }) => void;
  onNote: () => void;
  onDelete: () => void;
  onClose: () => void;
}

/** Floating toolbar shown after tapping an existing highlight. */
export function AnnotationBar({ annotation, colors, onChange, onNote, onDelete, onClose }: Props) {
  return (
    <View style={[styles.bar, { backgroundColor: colors.bg, shadowColor: '#000' }]}>
      <View style={styles.row}>
        {HIGHLIGHT_COLORS.map((c) => (
          <Pressable
            key={c.value}
            onPress={() => onChange({ color: c.value })}
            hitSlop={6}
            style={[
              styles.swatch,
              { backgroundColor: c.value },
              annotation.color === c.value && styles.swatchActive,
            ]}
          />
        ))}
      </View>
      <View style={styles.row}>
        {HIGHLIGHT_STYLES.map((s) => (
          <Pressable
            key={s.value}
            onPress={() => onChange({ style: s.value })}
            style={[styles.pill, (annotation.style ?? 'highlight') === s.value && styles.pillActive]}
          >
            <ThemedText
              type="small"
              style={{
                color: (annotation.style ?? 'highlight') === s.value ? '#fff' : colors.fg,
              }}
            >
              {s.label}
            </ThemedText>
          </Pressable>
        ))}
      </View>
      <View style={styles.row}>
        <Pressable onPress={onNote} style={styles.action}>
          <ThemedText type="small" style={styles.actionText}>
            {annotation.note ? 'Edit Note' : 'Add Note'}
          </ThemedText>
        </Pressable>
        <Pressable onPress={onDelete} style={styles.action}>
          <ThemedText type="small" style={[styles.actionText, { color: '#d33' }]}>
            Delete
          </ThemedText>
        </Pressable>
        <Pressable onPress={onClose} style={[styles.action, styles.actionLast]}>
          <ThemedText type="small" style={{ color: colors.fg }}>
            Done
          </ThemedText>
        </Pressable>
      </View>
      {annotation.note ? (
        <ThemedText type="small" numberOfLines={3} style={[styles.note, { color: colors.fg }]}>
          {annotation.note}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: Spacing.three,
    right: Spacing.three,
    bottom: Spacing.four,
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
  swatch: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  swatchActive: { borderColor: '#333', transform: [{ scale: 1.15 }] },
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
  note: { fontStyle: 'italic', opacity: 0.8 },
});
