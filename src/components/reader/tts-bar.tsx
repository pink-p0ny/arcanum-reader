import { useEffect, useState } from 'react';
import { useStore } from '@/lib/store';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Voice } from 'expo-speech';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { settingsStore, updateSettings } from '@/lib/settings';
import { listVoices, TTS_RATES, ttsStore, type TtsController } from '@/lib/tts';

interface Props {
  controller: TtsController;
  colors: { bg: string; fg: string };
  bottomInset: number;
}

export function TtsBar({ controller, colors, bottomInset }: Props) {
  const state = useStore(ttsStore);
  const { ttsRate, ttsVoice } = useStore(settingsStore);
  const [showVoices, setShowVoices] = useState(false);

  const cycleRate = () => {
    const i = TTS_RATES.indexOf(ttsRate);
    const next = TTS_RATES[(i + 1) % TTS_RATES.length];
    updateSettings({ ttsRate: next }).then(() => controller.refresh());
  };

  return (
    <View
      style={[
        styles.bar,
        {
          paddingBottom: bottomInset + 8,
          backgroundColor: colors.bg,
          borderTopColor: `${colors.fg}22`,
        },
      ]}
    >
      <ThemedText type="small" numberOfLines={2} style={[styles.sentence, { color: colors.fg }]}>
        {state.sentence || 'Starting…'}
      </ThemedText>
      <View style={styles.controls}>
        <Pressable onPress={() => setShowVoices(true)} style={styles.side} hitSlop={8}>
          <ThemedText type="small" style={{ color: colors.fg }}>
            Voice
          </ThemedText>
        </Pressable>
        <View style={styles.transport}>
          <Pressable onPress={() => controller.prev()} hitSlop={10} style={styles.button}>
            <ThemedText style={[styles.glyph, { color: colors.fg }]}>⏮</ThemedText>
          </Pressable>
          <Pressable onPress={() => controller.toggle()} hitSlop={10} style={[styles.button, styles.play]}>
            <ThemedText style={styles.playGlyph}>{state.playing ? '❚❚' : '▶'}</ThemedText>
          </Pressable>
          <Pressable onPress={() => controller.next()} hitSlop={10} style={styles.button}>
            <ThemedText style={[styles.glyph, { color: colors.fg }]}>⏭</ThemedText>
          </Pressable>
        </View>
        <View style={[styles.side, styles.sideRight]}>
          <Pressable onPress={cycleRate} hitSlop={8}>
            <ThemedText type="small" style={{ color: colors.fg, fontVariant: ['tabular-nums'] }}>
              {ttsRate}×
            </ThemedText>
          </Pressable>
          <Pressable onPress={() => controller.stop()} hitSlop={8}>
            <ThemedText type="small" style={{ color: '#e8734a', fontWeight: '600' }}>
              Stop
            </ThemedText>
          </Pressable>
        </View>
      </View>
      <VoicePicker
        visible={showVoices}
        current={ttsVoice}
        onSelect={(id) => {
          setShowVoices(false);
          updateSettings({ ttsVoice: id }).then(() => controller.refresh());
        }}
        onClose={() => setShowVoices(false)}
      />
    </View>
  );
}

function VoicePicker({
  visible,
  current,
  onSelect,
  onClose,
}: {
  visible: boolean;
  current: string | null;
  onSelect: (id: string | null) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const [voices, setVoices] = useState<Voice[] | null>(null);
  useEffect(() => {
    if (!visible || voices) return;
    listVoices()
      .then(setVoices)
      .catch(() => setVoices([]));
  }, [visible, voices]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <SafeAreaView style={[styles.sheet, { backgroundColor: theme.background }]} edges={['bottom']}>
        <View style={styles.sheetHeader}>
          <ThemedText style={styles.sheetTitle}>Voice</ThemedText>
          <Pressable onPress={onClose} hitSlop={8}>
            <ThemedText style={styles.done}>Done</ThemedText>
          </Pressable>
        </View>
        <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
          Higher-quality voices can be downloaded in iPad Settings › Accessibility › Spoken Content › Voices.
        </ThemedText>
        <ScrollView contentContainerStyle={styles.list}>
          <Pressable onPress={() => onSelect(null)} style={styles.voiceRow}>
            <ThemedText style={current === null ? styles.active : undefined}>System default</ThemedText>
          </Pressable>
          {(voices ?? []).map((v) => (
            <Pressable key={v.identifier} onPress={() => onSelect(v.identifier)} style={styles.voiceRow}>
              <ThemedText style={current === v.identifier ? styles.active : undefined}>{v.name}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {v.language} · {String(v.quality)}
              </ThemedText>
            </Pressable>
          ))}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 10,
    paddingHorizontal: Spacing.four,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  sentence: { textAlign: 'center', fontStyle: 'italic', minHeight: 20 },
  controls: { flexDirection: 'row', alignItems: 'center' },
  side: {
    width: 90,
    flexDirection: 'row',
    gap: Spacing.three,
    alignItems: 'center',
  },
  sideRight: { justifyContent: 'flex-end' },
  transport: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.five,
  },
  button: { alignItems: 'center', justifyContent: 'center' },
  glyph: { fontSize: 24 },
  play: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#e8734a' },
  playGlyph: { color: '#fff', fontSize: 20, fontWeight: '700' },
  sheet: { flex: 1 },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.three,
  },
  sheetTitle: { fontWeight: '600', fontSize: 17 },
  done: { color: '#e8734a', fontWeight: '700', fontSize: 17 },
  hint: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.two },
  list: { paddingBottom: Spacing.six },
  voiceRow: { paddingHorizontal: Spacing.three, paddingVertical: 12, gap: 2 },
  active: { color: '#e8734a', fontWeight: '700' },
});
