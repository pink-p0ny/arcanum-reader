import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { PremiumSheet } from '@/components/premium-sheet';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  AI_MODELS,
  aiStore,
  cloudStatus,
  ensureAiLoaded,
  setAiKey,
  setSelfHosted,
  testAiKey,
  testSelfHosted,
  updateAiConfig,
  type AiMode,
  type ServerStatus,
} from '@/lib/ai';
import { CLOUD_ENABLED, ensurePremiumLoaded, premiumStore } from '@/lib/premium';
import { useStore } from '@/lib/store';

interface Props {
  visible: boolean;
  onClose: () => void;
}

/** How AI features run: off, Arcanum Cloud (subscription), the reader's own Anthropic key, or their own server. */
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

type Status = { kind: 'idle' | 'busy' | 'ok' | 'error'; text?: string };

const quotaLine = (s: ServerStatus) =>
  `${s.quota.used} of ${s.quota.limit} picks used today; resets at midnight UTC.`;

function Body({ onClose }: { onClose: () => void }) {
  const theme = useTheme();
  const ai = useStore(aiStore);
  const premium = useStore(premiumStore);
  const [key, setKey] = useState('');
  const [selfUrl, setSelfUrl] = useState('');
  const [selfToken, setSelfToken] = useState('');
  const [showPaywall, setShowPaywall] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [cloud, setCloud] = useState<ServerStatus | null>(null);

  useEffect(() => {
    ensureAiLoaded().then(() => setSelfUrl((u) => u || aiStore.get().selfUrl));
    if (CLOUD_ENABLED) ensurePremiumLoaded();
  }, []);

  useEffect(() => {
    if (ai.mode !== 'cloud' || !premium.active) return;
    let live = true;
    cloudStatus()
      .then((s) => live && setCloud(s))
      .catch((e: Error) => live && setStatus({ kind: 'error', text: e.message }));
    return () => {
      live = false;
    };
  }, [ai.mode, premium.active]);

  const modes: { id: AiMode; label: string; hint: string }[] = [
    { id: 'off', label: 'Off', hint: 'On-device scorer' },
    ...(CLOUD_ENABLED
      ? [{ id: 'cloud' as AiMode, label: 'Arcanum Cloud', hint: premium.active ? 'Subscribed' : 'Subscription' }]
      : []),
    { id: 'byok', label: 'Own API key', hint: 'Your Anthropic account' },
    { id: 'self', label: 'Self-hosted', hint: 'Your Arcanum Server' },
  ];

  const choose = (mode: AiMode) => {
    if (mode === 'cloud' && !premium.active) {
      setShowPaywall(true);
      return;
    }
    setStatus({ kind: 'idle' });
    updateAiConfig({ mode });
  };

  const saveKey = async () => {
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

  const saveSelf = async () => {
    if (!selfUrl.trim() || !selfToken.trim()) return;
    setStatus({ kind: 'busy' });
    try {
      const info = await testSelfHosted(selfUrl, selfToken);
      await setSelfHosted(selfUrl, selfToken);
      setSelfToken('');
      setStatus({ kind: 'ok', text: `Connected. ${quotaLine(info)}` });
    } catch (e) {
      setStatus({ kind: 'error', text: (e as Error).message });
    }
  };

  const forgetSelf = async () => {
    await setSelfHosted('', null);
    setSelfUrl('');
    setStatus({ kind: 'idle' });
  };

  const pill = (active: boolean) => [styles.pill, { backgroundColor: theme.backgroundElement }, active && styles.pillActive];
  const pillText = (active: boolean) => ({ color: active ? '#fff' : theme.text, fontWeight: '600' as const });
  const pillHint = (active: boolean) => ({ color: active ? '#ffffffcc' : theme.textSecondary });

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
            <Pressable key={m.id} onPress={() => choose(m.id)} style={pill(ai.mode === m.id)}>
              <ThemedText style={pillText(ai.mode === m.id)}>{m.label}</ThemedText>
              <ThemedText type="small" style={pillHint(ai.mode === m.id)}>
                {m.hint}
              </ThemedText>
            </Pressable>
          ))}
        </View>

        {ai.mode !== 'off' ? (
          <>
            <Label>MODEL</Label>
            <View style={styles.pills}>
              {AI_MODELS.map((m) => (
                <Pressable key={m.id} onPress={() => updateAiConfig({ model: m.id })} style={pill(ai.model === m.id)}>
                  <ThemedText style={pillText(ai.model === m.id)}>{m.label}</ThemedText>
                  <ThemedText type="small" style={pillHint(ai.model === m.id)}>
                    {m.hint}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}

        {ai.mode === 'cloud' ? (
          <>
            <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
              {premium.active
                ? `Arcanum Cloud is active on this Apple ID.${cloud && ai.mode === 'cloud' ? ` ${quotaLine(cloud)}` : ''}`
                : 'Arcanum Cloud needs a subscription.'}
            </ThemedText>
            <Pressable onPress={() => setShowPaywall(true)} hitSlop={8} style={styles.inlineLink}>
              <ThemedText style={styles.link}>{premium.active ? 'Manage subscription' : 'Subscribe'}</ThemedText>
            </Pressable>
          </>
        ) : null}

        {ai.mode === 'byok' ? (
          <>
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
                onPress={saveKey}
                disabled={!key.trim() || status.kind === 'busy'}
                style={[styles.primary, (!key.trim() || status.kind === 'busy') && styles.disabled]}
              >
                <ThemedText style={styles.primaryText}>{status.kind === 'busy' ? 'Checking…' : 'Test and Save'}</ThemedText>
              </Pressable>
              {ai.hasKey ? (
                <Pressable onPress={() => setAiKey(null).then(() => setStatus({ kind: 'idle' }))} hitSlop={8} style={styles.forget}>
                  <ThemedText style={{ color: '#d33' }}>Forget Key</ThemedText>
                </Pressable>
              ) : null}
            </View>
            <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
              Keys are created at console.anthropic.com and billed to your own account. The key is stored in
              the iOS keychain and used only for these requests.
            </ThemedText>
          </>
        ) : null}

        {ai.mode === 'self' ? (
          <>
            <Label>{`SERVER${ai.hasSelfToken && ai.selfUrl ? ' · CONNECTED' : ''}`}</Label>
            <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
              <TextInput
                value={selfUrl}
                onChangeText={setSelfUrl}
                placeholder="https://ai.example.org"
                placeholderTextColor={theme.textSecondary}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                style={[styles.input, { color: theme.text }]}
                editable={status.kind !== 'busy'}
              />
              <View style={[styles.divider, { backgroundColor: theme.background }]} />
              <TextInput
                value={selfToken}
                onChangeText={setSelfToken}
                placeholder={ai.hasSelfToken ? 'Paste a new access token to replace it' : 'Access token'}
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
                onPress={saveSelf}
                disabled={!selfUrl.trim() || !selfToken.trim() || status.kind === 'busy'}
                style={[styles.primary, (!selfUrl.trim() || !selfToken.trim() || status.kind === 'busy') && styles.disabled]}
              >
                <ThemedText style={styles.primaryText}>{status.kind === 'busy' ? 'Checking…' : 'Test and Save'}</ThemedText>
              </Pressable>
              {ai.hasSelfToken ? (
                <Pressable onPress={forgetSelf} hitSlop={8} style={styles.forget}>
                  <ThemedText style={{ color: '#d33' }}>Forget Server</ThemedText>
                </Pressable>
              ) : null}
            </View>
            <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
              Run Arcanum Server on your own machine with your own provider key (github.com/pink-p0ny/arcanum-server)
              and paste its ACCESS_TOKEN here. The token is stored in the iOS keychain.
            </ThemedText>
          </>
        ) : null}

        {status.text ? (
          <ThemedText type="small" style={[styles.status, { color: status.kind === 'error' ? '#d33' : theme.textSecondary }]}>
            {status.text}
          </ThemedText>
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
  divider: { height: StyleSheet.hairlineWidth },
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
