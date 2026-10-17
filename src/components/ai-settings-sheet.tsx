import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { AI_MODELS, aiStore, ensureAiLoaded, setAiKey, testAiKey, updateAiConfig } from '@/lib/ai';
import { useStore } from '@/lib/store';

interface Props {
  visible: boolean;
  onClose: () => void;
}

/** Bring-your-own-key setup for AI picks. The hosted and self-hosted modes join this sheet later. */
export function AiSettingsSheet({ visible, onClose }: Props) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      {visible ? <Body onClose={onClose} /> : null}
    </Modal>
  );
}

function Body({ onClose }: { onClose: () => void }) {
  const theme = useTheme();
  const ai = useStore(aiStore);
  const [key, setKey] = useState('');
  const [status, setStatus] = useState<{ kind: 'idle' | 'busy' | 'ok' | 'error'; text?: string }>({
    kind: 'idle',
  });

  useEffect(() => {
    ensureAiLoaded();
  }, []);

  const enabled = ai.mode === 'byok';

  const toggle = (on: boolean) => updateAiConfig({ mode: on ? 'byok' : 'off' });

  const save = async () => {
    if (!key.trim()) return;
    setStatus({ kind: 'busy' });
    try {
      await testAiKey(key, ai.model);
      await setAiKey(key);
      setKey('');
      setStatus({ kind: 'ok', text: 'Key works and is saved in the keychain.' });
    } catch (e) {
      setStatus({ kind: 'error', text: (e as Error).message });
    }
  };

  const forget = async () => {
    await setAiKey(null);
    setStatus({ kind: 'idle' });
  };

  return (
    <View style={[styles.sheet, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <ThemedText type="subtitle">AI Picks</ThemedText>
        <Pressable onPress={onClose} hitSlop={10}>
          <ThemedText style={styles.link}>Done</ThemedText>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
          <View style={styles.row}>
            <ThemedText>Use my own Anthropic key</ThemedText>
            <Switch value={enabled} onValueChange={toggle} />
          </View>
        </View>
        <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
          Surprise Me asks Claude to choose, and you can tell it what you are in the mood for. Only a short
          list of candidate titles and a summary of your taste are sent. Your library, server and sign-in
          never leave the device.
        </ThemedText>

        {enabled ? (
          <>
            <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
              MODEL
            </ThemedText>
            <View style={styles.pills}>
              {AI_MODELS.map((m) => (
                <Pressable
                  key={m.id}
                  onPress={() => updateAiConfig({ model: m.id })}
                  style={[
                    styles.pill,
                    { backgroundColor: theme.backgroundElement },
                    ai.model === m.id && styles.pillActive,
                  ]}
                >
                  <ThemedText style={{ color: ai.model === m.id ? '#fff' : theme.text, fontWeight: '600' }}>
                    {m.label}
                  </ThemedText>
                  <ThemedText
                    type="small"
                    style={{ color: ai.model === m.id ? '#ffffffcc' : theme.textSecondary }}
                  >
                    {m.hint}
                  </ThemedText>
                </Pressable>
              ))}
            </View>

            <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
              API KEY {ai.hasKey ? '· SAVED' : ''}
            </ThemedText>
            <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
              <TextInput
                value={key}
                onChangeText={setKey}
                placeholder={ai.hasKey ? 'Paste a new key to replace it' : 'sk-ant-…'}
                placeholderTextColor={theme.textSecondary}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                style={[styles.input, { color: theme.text }]}
                editable={status.kind !== 'busy'}
              />
            </View>
            <View style={styles.actions}>
              <Pressable
                onPress={save}
                disabled={!key.trim() || status.kind === 'busy'}
                style={[styles.primary, (!key.trim() || status.kind === 'busy') && styles.disabled]}
              >
                <ThemedText style={styles.primaryText}>
                  {status.kind === 'busy' ? 'Checking…' : 'Test and Save'}
                </ThemedText>
              </Pressable>
              {ai.hasKey ? (
                <Pressable onPress={forget} hitSlop={8} style={styles.forget}>
                  <ThemedText style={{ color: '#d33' }}>Forget Key</ThemedText>
                </Pressable>
              ) : null}
            </View>
            {status.text ? (
              <ThemedText
                type="small"
                style={[styles.status, { color: status.kind === 'error' ? '#d33' : theme.textSecondary }]}
              >
                {status.text}
              </ThemedText>
            ) : null}
            <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
              Keys are created at console.anthropic.com and billed to your own account. The key is stored in
              the iOS keychain and used only for these requests.
            </ThemedText>
          </>
        ) : null}
      </ScrollView>
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
  body: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.six, gap: Spacing.two },
  card: { borderRadius: 12, paddingHorizontal: Spacing.three },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.two,
  },
  hint: { paddingHorizontal: Spacing.one, marginBottom: Spacing.two },
  label: { letterSpacing: 0.6, marginTop: Spacing.two, paddingHorizontal: Spacing.one },
  pills: { flexDirection: 'row', gap: Spacing.two },
  pill: { flex: 1, borderRadius: 12, padding: Spacing.three, gap: 2 },
  pillActive: { backgroundColor: '#e8734a' },
  input: { fontSize: 16, paddingVertical: 12 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, marginTop: Spacing.one },
  primary: {
    backgroundColor: '#e8734a',
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 10,
  },
  primaryText: { color: '#fff', fontWeight: '600' },
  forget: { paddingVertical: 8 },
  status: { paddingHorizontal: Spacing.one },
  disabled: { opacity: 0.5 },
});
