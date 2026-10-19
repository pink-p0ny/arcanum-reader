import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { PremiumSheet } from '@/components/premium-sheet';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  AI_MODELS,
  aiStore,
  ensureAiLoaded,
  setAiKey,
  testAiKey,
  updateAiConfig,
  type AiMode,
} from '@/lib/ai';
import { CLOUD_ENABLED, ensurePremiumLoaded, premiumStore } from '@/lib/premium';
import { useStore } from '@/lib/store';

interface Props {
  visible: boolean;
  onClose: () => void;
}

/** How AI features run: off, Arcanum Cloud (subscription), or the reader's own Anthropic key. */
export function AiSettingsSheet({ visible, onClose }: Props) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      {visible ? <Body onClose={onClose} /> : null}
    </Modal>
  );
}

function Label({ children }: { children: string }) {
  return (
    <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
      {children}
    </ThemedText>
  );
}

function Body({ onClose }: { onClose: () => void }) {
  const theme = useTheme();
  const ai = useStore(aiStore);
  const premium = useStore(premiumStore);
  const [key, setKey] = useState('');
  const [showPaywall, setShowPaywall] = useState(false);
  const [status, setStatus] = useState<{ kind: 'idle' | 'busy' | 'ok' | 'error'; text?: string }>({
    kind: 'idle',
  });

  useEffect(() => {
    ensureAiLoaded();
    if (CLOUD_ENABLED) ensurePremiumLoaded();
  }, []);

  const modes: { id: AiMode; label: string; hint: string }[] = [
    { id: 'off', label: 'Off', hint: 'Surprise Me uses the on-device scorer' },
    ...(CLOUD_ENABLED
      ? [
          {
            id: 'cloud' as AiMode,
            label: 'Arcanum Cloud',
            hint: premium.active ? 'Subscribed' : 'Subscription',
          },
        ]
      : []),
    { id: 'byok', label: 'Own API key', hint: 'Free, billed to your Anthropic account' },
  ];

  const choose = (mode: AiMode) => {
    if (mode === 'cloud' && !premium.active) {
      setShowPaywall(true);
      return;
    }
    updateAiConfig({ mode });
  };

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
        <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
          Surprise Me asks Claude to choose, and you can tell it what you are in the mood for. Only a short
          list of candidate titles and a summary of your taste are sent. Your library, server and sign-in
          never leave the device.
        </ThemedText>

        <Label>RUNS ON</Label>
        <View style={styles.pills}>
          {modes.map((m) => (
            <Pressable
              key={m.id}
              onPress={() => choose(m.id)}
              style={[
                styles.pill,
                { backgroundColor: theme.backgroundElement },
                ai.mode === m.id && styles.pillActive,
              ]}
            >
              <ThemedText style={{ color: ai.mode === m.id ? '#fff' : theme.text, fontWeight: '600' }}>
                {m.label}
              </ThemedText>
              <ThemedText
                type="small"
                style={{ color: ai.mode === m.id ? '#ffffffcc' : theme.textSecondary }}
              >
                {m.hint}
              </ThemedText>
            </Pressable>
          ))}
        </View>

        {ai.mode === 'cloud' ? (
          <>
            <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
              {premium.active
                ? 'Arcanum Cloud is active on this Apple ID. The service itself is still being built; until it is live, Surprise Me falls back to the on-device scorer.'
                : 'Arcanum Cloud needs a subscription.'}
            </ThemedText>
            <Pressable onPress={() => setShowPaywall(true)} hitSlop={8} style={styles.inlineLink}>
              <ThemedText style={styles.link}>
                {premium.active ? 'Manage subscription' : 'Subscribe'}
              </ThemedText>
            </Pressable>
          </>
        ) : null}

        {ai.mode === 'byok' ? (
          <>
            <Label>MODEL</Label>
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

            <Label>{`API KEY${ai.hasKey ? ' · SAVED' : ''}`}</Label>
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
      <PremiumSheet
        visible={showPaywall}
        onClose={() => setShowPaywall(false)}
        onActivated={() => updateAiConfig({ mode: 'cloud' })}
      />
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
  inlineLink: { paddingHorizontal: Spacing.one, paddingVertical: Spacing.one },
  body: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.six, gap: Spacing.two },
  card: { borderRadius: 12, paddingHorizontal: Spacing.three },
  hint: { paddingHorizontal: Spacing.one, marginBottom: Spacing.two },
  label: { letterSpacing: 0.6, marginTop: Spacing.two, paddingHorizontal: Spacing.one },
  pills: { flexDirection: 'row', gap: Spacing.two },
  pill: { flex: 1, borderRadius: 12, padding: Spacing.three, gap: 2 },
  pillActive: { backgroundColor: '#e8734a' },
  input: { fontSize: 16, paddingVertical: 12 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, marginTop: Spacing.one },
  primary: { backgroundColor: '#e8734a', paddingHorizontal: 18, paddingVertical: 11, borderRadius: 10 },
  primaryText: { color: '#fff', fontWeight: '600' },
  forget: { paddingVertical: 8 },
  status: { paddingHorizontal: Spacing.one },
  disabled: { opacity: 0.5 },
});
