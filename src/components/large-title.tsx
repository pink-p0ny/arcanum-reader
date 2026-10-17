import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

export function LargeTitle({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <ThemedText style={styles.title}>{title}</ThemedText>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.two,
  },
  title: {
    fontSize: 34,
    lineHeight: 41,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
});
