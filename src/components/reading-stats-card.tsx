import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatMinutes, type ReadingStats } from '@/lib/stats';

/** "Keep the fire lit": this week's reading time, a streak, and seven small bars. Hidden until there is data. */
export function ReadingStatsCard({ stats }: { stats: ReadingStats }) {
  const theme = useTheme();
  if (stats.weekMinutes === 0 && stats.streakDays === 0) return null;
  const max = Math.max(1, ...stats.week.map((d) => d.minutes));
  const streak =
    stats.streakDays >= 2
      ? `${stats.streakDays}-day streak`
      : stats.todayMinutes > 0
        ? 'Read today'
        : 'Read today to keep the streak';
  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
      <View style={styles.text}>
        <ThemedText style={styles.headline}>{formatMinutes(stats.weekMinutes)} this week</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {stats.streakDays >= 2 ? '🔥 ' : ''}
          {streak}
          {stats.booksThisWeek > 1 ? ` · ${stats.booksThisWeek} books` : ''}
        </ThemedText>
      </View>
      <View style={styles.bars} accessibilityLabel="Reading minutes per day for the last seven days">
        {stats.week.map((d) => (
          <View key={d.day} style={styles.barSlot}>
            <View
              style={[
                styles.bar,
                {
                  height: Math.max(3, Math.round((d.minutes / max) * 36)),
                  backgroundColor: d.minutes > 0 ? '#e8734a' : theme.backgroundSelected,
                },
              ]}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: Spacing.four,
    borderRadius: 14,
    padding: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  text: { flex: 1, gap: 2 },
  headline: { fontSize: 17, fontWeight: '700' },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 36 },
  barSlot: { width: 10, height: 36, justifyContent: 'flex-end' },
  bar: { width: 10, borderRadius: 3 },
});
