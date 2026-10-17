import { Image } from 'expo-image';
import { useStore } from '@/lib/store';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { getProvider } from '@/lib/provider';
import { sessionStore } from '@/lib/session';
import type { AppBookSummary } from '@/lib/types';

interface Props {
  book: Pick<AppBookSummary, 'id' | 'title' | 'coverUpdatedOn' | 'readProgress'>;
  width: number;
  showProgress?: boolean;
}

export const COVER_RATIO = 3 / 2;

export function BookCover({ book, width, showProgress }: Props) {
  const theme = useTheme();
  // Subscribing keeps covers fresh when the token rotates; the provider reads the credentials itself.
  const session = useStore(sessionStore, (s) => s.session);
  const source = session ? getProvider().coverSource(book) : null;
  const height = Math.round(width * COVER_RATIO);
  const progress = book.readProgress ?? 0;

  return (
    <View style={{ width }}>
      <View style={[styles.frame, { width, height, backgroundColor: theme.backgroundElement }]}>
        {source ? (
          <Image
            source={source}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={150}
            cachePolicy="disk"
            recyclingKey={String(book.id)}
          />
        ) : null}
        <View style={styles.fallback} pointerEvents="none">
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={4} style={styles.fallbackText}>
            {book.title}
          </ThemedText>
        </View>
      </View>
      {showProgress ? (
        <View
          style={[styles.track, { backgroundColor: progress > 0 ? theme.backgroundSelected : 'transparent' }]}
        >
          {progress > 0 ? <View style={[styles.fill, { width: `${Math.min(100, progress)}%` }]} /> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderRadius: 6,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  fallback: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    padding: 8,
    justifyContent: 'center',
    zIndex: -1,
  },
  fallbackText: { textAlign: 'center' },
  track: { height: 3, borderRadius: 2, marginTop: 6, overflow: 'hidden' },
  fill: { height: 3, backgroundColor: '#e8734a' },
});
