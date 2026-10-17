import { Alert, Modal, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useStore } from '@/lib/store';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  FONT_CHOICES,
  clamp,
  isDefaultDisplay,
  resetDisplaySettings,
  settingsStore,
  updateSettings,
  type ReaderSettings,
  type ReaderTheme,
} from '@/lib/settings';

interface Props {
  visible: boolean;
  onClose: () => void;
}

function Stepper({
  label,
  value,
  display,
  onChange,
}: {
  label: string;
  value: number;
  display: string;
  onChange: (dir: -1 | 1) => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <ThemedText style={styles.label}>{label}</ThemedText>
      <View style={[styles.stepper, { backgroundColor: theme.backgroundElement }]}>
        <Pressable onPress={() => onChange(-1)} style={styles.stepBtn} hitSlop={6}>
          <ThemedText style={styles.stepText}>−</ThemedText>
        </Pressable>
        <ThemedText style={styles.stepValue}>{display || value}</ThemedText>
        <Pressable onPress={() => onChange(1)} style={styles.stepBtn} hitSlop={6}>
          <ThemedText style={styles.stepText}>+</ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

function Segmented<T extends string | null>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.block}>
      <ThemedText style={styles.label}>{label}</ThemedText>
      <View style={styles.segRow}>
        {options.map((o) => {
          const active = o.value === value;
          return (
            <Pressable
              key={String(o.value)}
              onPress={() => onChange(o.value)}
              style={[
                styles.seg,
                {
                  backgroundColor: active ? '#e8734a' : theme.backgroundElement,
                },
              ]}
            >
              <ThemedText type="small" style={{ color: active ? '#fff' : theme.text }}>
                {o.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function SettingsSheet({ visible, onClose }: Props) {
  const theme = useTheme();
  const s = useStore(settingsStore);
  const set = (patch: Partial<ReaderSettings>) => updateSettings(patch);
  const atDefaults = isDefaultDisplay(s);

  const confirmReset = () =>
    Alert.alert('Reset Reader Settings?', 'Theme, font, spacing and layout go back to their defaults.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: () => void resetDisplaySettings() },
    ]);

  const themes: { label: string; value: ReaderTheme }[] = [
    { label: 'Auto', value: 'system' },
    { label: 'Light', value: 'light' },
    { label: 'Sepia', value: 'sepia' },
    { label: 'Dark', value: 'dark' },
  ];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <SafeAreaView style={[styles.screen, { backgroundColor: theme.background }]} edges={['bottom']}>
        <View style={styles.header}>
          <ThemedText style={styles.headerTitle}>Reader Settings</ThemedText>
          <Pressable onPress={onClose} hitSlop={8}>
            <ThemedText style={styles.done}>Done</ThemedText>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          <Segmented label="Theme" options={themes} value={s.theme} onChange={(v) => set({ theme: v })} />

          <Stepper
            label="Font size"
            value={s.fontSize}
            display={`${s.fontSize} px`}
            onChange={(d) => set({ fontSize: clamp(s.fontSize + d, 12, 36) })}
          />
          <Stepper
            label="Line spacing"
            value={s.lineHeight}
            display={s.lineHeight.toFixed(1)}
            onChange={(d) =>
              set({
                lineHeight: clamp(Math.round((s.lineHeight + d * 0.1) * 10) / 10, 1.0, 2.4),
              })
            }
          />

          <Segmented
            label="Font"
            options={FONT_CHOICES}
            value={s.fontFamily}
            onChange={(v) => set({ fontFamily: v })}
          />

          <ThemedText type="small" themeColor="textSecondary" style={styles.groupTitle}>
            MARGINS & LAYOUT
          </ThemedText>
          <Stepper
            label="Side margins"
            value={s.sideMargin}
            display={`${s.sideMargin}%`}
            onChange={(d) => set({ sideMargin: clamp(s.sideMargin + d, 0, 25) })}
          />
          <Stepper
            label="Top & bottom margins"
            value={s.verticalMargin}
            display={`${s.verticalMargin} px`}
            onChange={(d) => set({ verticalMargin: clamp(s.verticalMargin + d * 8, 0, 120) })}
          />
          <Stepper
            label="Max text width"
            value={s.maxInlineSize}
            display={`${s.maxInlineSize} px`}
            onChange={(d) => set({ maxInlineSize: clamp(s.maxInlineSize + d * 40, 360, 1200) })}
          />
          <Segmented
            label="Columns (landscape)"
            options={
              [
                { label: 'One', value: 1 as const },
                { label: 'Two', value: 2 as const },
              ] as unknown as { label: string; value: string }[]
            }
            value={String(s.maxColumns) as unknown as string}
            onChange={(v) => set({ maxColumns: Number(v) === 2 ? 2 : 1 })}
          />
          <Segmented
            label="Flow"
            options={[
              { label: 'Pages', value: 'paginated' as const },
              { label: 'Scroll', value: 'scrolled' as const },
            ]}
            value={s.flow}
            onChange={(v) => set({ flow: v })}
          />

          <View style={styles.row}>
            <ThemedText style={styles.label}>Justify text</ThemedText>
            <Switch value={s.justify} onValueChange={(v) => set({ justify: v })} />
          </View>
          <View style={styles.row}>
            <ThemedText style={styles.label}>Hyphenation</ThemedText>
            <Switch value={s.hyphenate} onValueChange={(v) => set({ hyphenate: v })} />
          </View>

          <Pressable
            onPress={confirmReset}
            disabled={atDefaults}
            accessibilityRole="button"
            accessibilityState={{ disabled: atDefaults }}
            style={({ pressed }) => [
              styles.reset,
              { backgroundColor: theme.backgroundElement, opacity: atDefaults ? 0.4 : pressed ? 0.7 : 1 },
            ]}
          >
            <ThemedText style={styles.resetText}>Reset to Defaults</ThemedText>
          </Pressable>
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
  content: {
    padding: Spacing.three,
    gap: Spacing.three,
    paddingBottom: Spacing.six,
  },
  block: { gap: Spacing.two },
  groupTitle: { marginTop: Spacing.two, letterSpacing: 0.5 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 40,
  },
  label: { fontSize: 16 },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    overflow: 'hidden',
  },
  stepBtn: {
    width: 44,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: { fontSize: 22, lineHeight: 26, fontWeight: '500' },
  stepValue: {
    minWidth: 70,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  segRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  seg: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16 },
  reset: {
    marginTop: Spacing.two,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  resetText: { color: '#e8734a', fontWeight: '600', fontSize: 16 },
});
