import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { binderyStore, ensureBinderyLoaded, setBinderyKey, setBinderyUrl, testBindery } from '@/lib/bindery';
import { useStore } from '@/lib/store';

interface Props {
  visible: boolean;
  onClose: () => void;
}

/** Address and API key for a Bindery server, so the app can ask it for books. */
export function BinderySettingsSheet({ visible, onClose }: Props) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      {visible ? <Body onClose={onClose} /> : null}
    </Modal>
  );
}

function Body({ onClose }: { onClose: () => void }) {
  const theme = useTheme();
  const cfg = useStore(binderyStore);
  const [url, setUrl] = useState(cfg.url ?? '');
  const [key, setKey] = useState('');
  const [status, setStatus] = useState<{ kind: 'idle' | 'busy' | 'ok' | 'error'; text?: string }>({
    kind: 'idle',
  });

  useEffect(() => {
    ensureBinderyLoaded();
  }, []);

  const save = async () => {
    if (!url.trim() || (!key.trim() && !cfg.hasKey)) return;
    setStatus({ kind: 'busy' });
    try {
      if (key.trim()) {
        await testBindery(url, key);
        await setBinderyKey(key);
      }
      await setBinderyUrl(url);
      setKey('');
      setStatus({ kind: 'ok', text: 'Connected. Bindery accepted the key.' });
    } catch (e) {
      setStatus({ kind: 'error', text: (e as Error).message });
    }
  };

  const forget = async () => {
    await setBinderyKey(null);
    await setBinderyUrl(null);
    setUrl('');
    setStatus({ kind: 'idle' });
  };

  const canSave = !!url.trim() && (!!key.trim() || cfg.hasKey) && status.kind !== 'busy';

  return (
    <View style={[styles.sheet, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <ThemedText type="subtitle">Bindery</ThemedText>
        <Pressable onPress={onClose} hitSlop={10}>
          <ThemedText style={styles.link}>Done</ThemedText>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
          Bindery finds books you do not have yet and drops them into Grimmory. With its address and API key
          (Settings › General › Security in Bindery), you can search for a book and ask for it from here.
        </ThemedText>

        <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
          ADDRESS
        </ThemedText>
        <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
          <TextInput
            value={url}
            onChangeText={setUrl}
            placeholder="https://bindery.example.net"
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={[styles.input, { color: theme.text }]}
            editable={status.kind !== 'busy'}
          />
        </View>

        <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
          API KEY {cfg.hasKey ? '· SAVED' : ''}
        </ThemedText>
        <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
          <TextInput
            value={key}
            onChangeText={setKey}
            placeholder={cfg.hasKey ? 'Paste a new key to replace it' : 'API key'}
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            style={[styles.input, { color: theme.text }]}
            editable={status.kind !== 'busy'}
          />
        </View>

        <View style={styles.actions}>
          <Pressable onPress={save} disabled={!canSave} style={[styles.primary, !canSave && styles.disabled]}>
            <ThemedText style={styles.primaryText}>
              {status.kind === 'busy' ? 'Checking…' : 'Test and Save'}
            </ThemedText>
          </Pressable>
          {cfg.hasKey || cfg.url ? (
            <Pressable onPress={forget} hitSlop={8} style={styles.forget}>
              <ThemedText style={{ color: '#d33' }}>Disconnect</ThemedText>
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
          An admin key adds and searches for the book right away. A requester key files a request for an admin
          to approve. The key is stored in the iOS keychain.
        </ThemedText>
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
  hint: { paddingHorizontal: Spacing.one, marginBottom: Spacing.two },
  label: { letterSpacing: 0.6, marginTop: Spacing.two, paddingHorizontal: Spacing.one },
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
