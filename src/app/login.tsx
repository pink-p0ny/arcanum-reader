import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { localOnlyStore, login, setLocalOnly } from '@/lib/session';
import { useStore } from '@/lib/store';

export default function LoginScreen() {
  const theme = useTheme();
  const [server, setServer] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const localOnly = useStore(localOnlyStore);
  const router = useRouter();

  const submit = async () => {
    if (!server.trim() || !username.trim() || !password) return;
    setBusy(true);
    setError(null);
    try {
      await login(server, username.trim(), password);
      if (localOnly) router.back();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const field = [styles.input, { backgroundColor: theme.backgroundElement, color: theme.text }];

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.center}>
        <View style={styles.card}>
          <ThemedText type="title" style={styles.title}>
            Arcanum
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.subtitle}>
            Sign in to your Grimmory or Booklore server
          </ThemedText>

          <TextInput
            style={field}
            value={server}
            onChangeText={setServer}
            placeholder="https://books.example.com"
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            textContentType="URL"
          />
          <TextInput
            style={field}
            value={username}
            onChangeText={setUsername}
            placeholder="Username"
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="username"
          />
          <TextInput
            style={field}
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            placeholderTextColor={theme.textSecondary}
            secureTextEntry
            textContentType="password"
            onSubmitEditing={submit}
            returnKeyType="go"
          />

          {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}

          <Pressable
            onPress={submit}
            disabled={busy}
            style={({ pressed }) => [styles.button, { opacity: pressed || busy ? 0.7 : 1 }]}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <ThemedText style={styles.buttonText}>Sign In</ThemedText>
            )}
          </Pressable>
          <Pressable
            onPress={() => (localOnly ? router.back() : setLocalOnly(true).then(() => router.replace('/')))}
            hitSlop={8}
            style={styles.skip}
          >
            <ThemedText themeColor="textSecondary" style={styles.skipText}>
              {localOnly ? 'Cancel' : 'No server? Use a folder of books instead'}
            </ThemedText>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  card: {
    width: '100%',
    maxWidth: Math.min(MaxContentWidth, 420),
    gap: Spacing.three,
  },
  title: { fontSize: 40, lineHeight: 46, textAlign: 'center' },
  subtitle: { textAlign: 'center', marginBottom: Spacing.two },
  input: {
    height: 48,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
  error: { color: '#d33', textAlign: 'center' },
  skip: { paddingVertical: Spacing.two },
  skipText: { textAlign: 'center' },
  button: {
    height: 50,
    borderRadius: 12,
    backgroundColor: '#e8734a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 17 },
});
