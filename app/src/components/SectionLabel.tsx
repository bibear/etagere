import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';

/** Small upper-case section heading of the mockups ("EN COURS"), with an optional action. */
export function SectionLabel({ label, action }: { label: string; action?: ReactNode }) {
  const { colors, fonts } = useTheme();
  return (
    <View style={styles.row}>
      <Text
        accessibilityRole="header"
        style={{
          color: colors.textMuted,
          fontFamily: fonts.bodySemiBold,
          fontSize: 13,
          letterSpacing: 0.6,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </Text>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 24,
  },
});
