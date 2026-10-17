import { Link } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function GenreChips({ genres }: { genres: { name: string; count: number }[] }) {
  const theme = useTheme();
  return (
    <View style={styles.wrap}>
      <ThemedText style={styles.title}>Browse by Genre</ThemedText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {genres.slice(0, 20).map((g) => (
          <Link key={g.name} href={{ pathname: '/library', params: { category: g.name } }} asChild>
            <Pressable
              accessibilityLabel={`${g.name}, ${g.count} ${g.count === 1 ? 'book' : 'books'}`}
              style={({ pressed }) => [
                styles.chip,
                {
                  backgroundColor: theme.backgroundElement,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <ThemedText type="small" style={styles.name}>
                {g.name}
              </ThemedText>
              <View style={[styles.badge, { backgroundColor: theme.backgroundSelected }]}>
                <ThemedText style={[styles.badgeText, { color: theme.textSecondary }]}>{g.count}</ThemedText>
              </View>
            </Pressable>
          </Link>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two },
  title: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
    paddingHorizontal: Spacing.four,
  },
  row: { paddingHorizontal: Spacing.four, gap: Spacing.two },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 14,
    paddingRight: 6,
    paddingVertical: 6,
    borderRadius: 20,
  },
  name: { fontWeight: '600' },
  badge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    paddingHorizontal: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 12, lineHeight: 14, fontWeight: '700' },
});
