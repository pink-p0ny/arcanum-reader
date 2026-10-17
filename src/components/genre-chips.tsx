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
              style={({ pressed }) => [
                styles.chip,
                {
                  backgroundColor: theme.backgroundElement,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <ThemedText type="small">{g.name}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {g.count}
              </ThemedText>
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
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
});
