import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface Props {
  visible: boolean;
  quote: string;
  initialNote: string;
  onSave: (note: string) => void;
  onCancel: () => void;
}

export function NoteModal({ visible, quote, initialNote, onSave, onCancel }: Props) {
  const theme = useTheme();
  // The parent remounts this modal (via `key`) for each new target, so local state starts fresh each time.
  const [note, setNote] = useState(initialNote);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet" onRequestClose={onCancel}>
      <SafeAreaView style={[styles.screen, { backgroundColor: theme.background }]} edges={['bottom']}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.screen}>
          <View style={styles.header}>
            <Pressable onPress={onCancel} hitSlop={8}>
              <ThemedText style={styles.headerAction}>Cancel</ThemedText>
            </Pressable>
            <ThemedText style={styles.headerTitle}>Note</ThemedText>
            <Pressable onPress={() => onSave(note.trim())} hitSlop={8}>
              <ThemedText style={[styles.headerAction, styles.bold]}>Save</ThemedText>
            </Pressable>
          </View>
          <ThemedText numberOfLines={4} themeColor="textSecondary" style={styles.quote}>
            “{quote}”
          </ThemedText>
          <TextInput
            value={note}
            onChangeText={setNote}
            multiline
            autoFocus
            placeholder="Write your note…"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
          />
        </KeyboardAvoidingView>
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
  headerAction: { color: '#e8734a', fontSize: 17 },
  headerTitle: { fontWeight: '600', fontSize: 17 },
  bold: { fontWeight: '700' },
  quote: { paddingHorizontal: Spacing.four, fontStyle: 'italic' },
  input: {
    flex: 1,
    margin: Spacing.three,
    borderRadius: 12,
    padding: Spacing.three,
    fontSize: 17,
    textAlignVertical: 'top',
  },
});
