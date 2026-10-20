import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useStore } from '@/lib/store';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import Constants from 'expo-constants';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AiSettingsSheet } from '@/components/ai-settings-sheet';
import { BinderySettingsSheet } from '@/components/bindery-settings-sheet';
import { HiddenGenresSheet } from '@/components/hidden-genres-sheet';
import { LargeTitle } from '@/components/large-title';
import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { clearLocalData, getBook, getDownloads } from '@/lib/db';
import { booksDir, deleteDownload, formatBytes } from '@/lib/downloads';
import { useLibrarySync } from '@/lib/library';
import { AI_MODELS, aiStore, ensureAiLoaded } from '@/lib/ai';
import { binderyStore, ensureBinderyLoaded } from '@/lib/bindery';
import { hiddenGenresStore } from '@/lib/genres';
import { clearSkips } from '@/lib/lucky';
import { localOnlyStore, logout, sessionStore, setLocalOnly } from '@/lib/session';
import { folderSupportsICloud, libraryFolder } from '@/lib/library-folder';
import { DEFAULT_READER_SETTINGS, updateSettings } from '@/lib/settings';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={styles.section}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.sectionTitle}>
        {title.toUpperCase()}
      </ThemedText>
      <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>{children}</View>
    </View>
  );
}

function Row({
  label,
  value,
  onPress,
  destructive,
}: {
  label: string;
  value?: string;
  onPress?: () => void;
  destructive?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}
    >
      <ThemedText style={destructive ? { color: '#d33' } : onPress ? { color: '#e8734a' } : undefined}>
        {label}
      </ThemedText>
      {value ? (
        <ThemedText
          themeColor="textSecondary"
          numberOfLines={1}
          style={[styles.value, { color: theme.textSecondary }]}
        >
          {value}
        </ThemedText>
      ) : null}
    </Pressable>
  );
}

export default function SettingsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const session = useStore(sessionStore, (s) => s.session);
  const localOnly = useStore(localOnlyStore);
  const [folderInfo, setFolderInfo] = useState<string>('');
  useEffect(() => {
    libraryFolder()
      .then(({ icloud }) =>
        setFolderInfo(
          icloud
            ? 'iCloud Drive › Arcanum'
            : folderSupportsICloud()
              ? 'On this iPad (iCloud is off)'
              : 'On this iPad',
        ),
      )
      .catch(() => setFolderInfo('Unavailable'));
  }, []);
  const ai = useStore(aiStore);
  const [showAi, setShowAi] = useState(false);
  const bindery = useStore(binderyStore);
  const [showBindery, setShowBindery] = useState(false);
  const hiddenGenres = useStore(hiddenGenresStore);
  const [showGenres, setShowGenres] = useState(false);
  useEffect(() => {
    ensureAiLoaded();
    ensureBinderyLoaded();
  }, []);
  const binderyConnected = !!bindery.url && bindery.hasKey;
  const modelLabel = AI_MODELS.find((m) => m.id === ai.model)?.label ?? ai.model;
  const aiSummary =
    ai.mode === 'cloud'
      ? `Arcanum Cloud · ${modelLabel}`
      : ai.mode === 'byok'
        ? ai.hasKey
          ? `Own key · ${modelLabel}`
          : 'Own key · not set'
        : ai.mode === 'self'
          ? ai.selfUrl && ai.hasSelfToken
            ? `Self-hosted · ${modelLabel}`
            : 'Self-hosted · not set'
          : 'Off';
  const { sync, syncing } = useLibrarySync();
  const qc = useQueryClient();
  const downloads = useQuery({
    queryKey: ['downloads'],
    queryFn: async () => {
      const rows = await getDownloads();
      return Promise.all(rows.map(async (r) => ({ ...r, book: await getBook(r.book_id) })));
    },
  });
  const totalBytes = (downloads.data ?? []).reduce((n, d) => n + (d.size_bytes ?? 0), 0);

  const confirmSignOut = () =>
    Alert.alert('Sign out?', 'Downloaded books and unsynced notes on this device will be removed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          try {
            const dir = booksDir();
            if (dir.exists) dir.delete();
            await clearLocalData();
          } catch {}
          qc.clear();
          await logout();
        },
      },
    ]);

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: insets.top,
          paddingBottom: insets.bottom + BottomTabInset + Spacing.four,
        },
      ]}
    >
      <LargeTitle title="Settings" />

      <Section title="Library">
        {session ? (
          <>
            <Row
              label={session.kind === 'booklore' ? 'Booklore server' : 'Grimmory server'}
              value={session.serverUrl.replace(/^https?:\/\//, '')}
            />
            <Row label="User" value={session.username} />
          </>
        ) : (
          <Row label="Sign In to a Server" onPress={() => router.push('/login')} />
        )}
        <Row label="Books Folder" value={folderInfo} />
        <Row label={syncing ? 'Syncing…' : 'Sync Library Now'} onPress={syncing ? undefined : sync} />
        {session ? <Row label="Sign Out" onPress={confirmSignOut} destructive /> : null}
        {!session && localOnly ? (
          <Row label="Leave Folder-Only Mode" onPress={() => setLocalOnly(false)} destructive />
        ) : null}
        <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
          Books in the folder show up alongside your server library. Drop EPUBs into it from any device, or
          use Add Books on the Library tab.
        </ThemedText>
      </Section>

      <Section title="Home">
        <Row
          label="Browse Genres"
          value={hiddenGenres.length ? `${hiddenGenres.length} hidden` : 'All shown'}
          onPress={() => setShowGenres(true)}
        />
        <Row
          label="Forget Surprise Me Skips"
          onPress={() => clearSkips().then(() => Alert.alert('Done', 'Every book is back in the draw.'))}
        />
        <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
          Hidden genres stay on the books but leave Browse by Genre, the shelves and Surprise Me.
        </ThemedText>
      </Section>
      <HiddenGenresSheet visible={showGenres} onClose={() => setShowGenres(false)} />

      <Section title="Reading">
        <Row label="Reset Reader Settings" onPress={() => updateSettings(DEFAULT_READER_SETTINGS)} />
        <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
          Fonts, margins and themes are adjusted inside the reader with the Aa button.
        </ThemedText>
      </Section>

      <Section title="Bindery">
        <Row
          label="Server"
          value={binderyConnected ? bindery.url!.replace(/^https?:\/\//, '') : 'Not connected'}
          onPress={() => setShowBindery(true)}
        />
        {binderyConnected ? <Row label="Request a Book" onPress={() => router.push('/request')} /> : null}
        <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
          Ask Bindery for books you do not have; it finds them and drops them into Grimmory.
        </ThemedText>
      </Section>
      <BinderySettingsSheet visible={showBindery} onClose={() => setShowBindery(false)} />

      <Section title="AI Services">
        <Row label="AI Picks" value={aiSummary} onPress={() => setShowAi(true)} />
        <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
          Optional. Bring your own Anthropic key today; hosted and self-hosted Arcanum Server options come
          with the next release.
        </ThemedText>
      </Section>
      <AiSettingsSheet visible={showAi} onClose={() => setShowAi(false)} />

      <Section title={`Downloads · ${formatBytes(totalBytes) || '0 KB'}`}>
        {(downloads.data ?? []).length === 0 ? (
          <ThemedText themeColor="textSecondary" style={styles.hint}>
            No books downloaded yet.
          </ThemedText>
        ) : (
          downloads.data!.map((d) => (
            <Row
              key={d.book_id}
              label={d.book?.title ?? `Book ${d.book_id}`}
              value={formatBytes(d.size_bytes)}
              onPress={() =>
                Alert.alert('Remove download?', d.book?.title, [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Remove',
                    style: 'destructive',
                    onPress: async () => {
                      await deleteDownload(d.book_id);
                      downloads.refetch();
                    },
                  },
                ])
              }
            />
          ))
        )}
      </Section>

      <ThemedText type="small" themeColor="textSecondary" style={styles.version}>
        Version {Constants.expoConfig?.version ?? '1.0.0'}
      </ThemedText>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.four },
  section: { gap: Spacing.one, paddingHorizontal: Spacing.four },
  sectionTitle: { paddingHorizontal: Spacing.three, letterSpacing: 0.5 },
  card: { borderRadius: 12, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    minHeight: 46,
    gap: Spacing.three,
  },
  value: { flexShrink: 1 },
  hint: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  version: { textAlign: 'center' },
});
