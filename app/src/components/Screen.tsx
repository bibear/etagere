import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OfflineBanner } from '../offline/OfflineBanner';
import { useTheme } from '../theme/ThemeProvider';

/** Tab screen frame: safe area, background, 20 px side padding, scrollable content. */
export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  const { colors } = useTheme();
  const content = (
    <View style={styles.content}>
      <OfflineBanner />
      {children}
    </View>
  );
  return (
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: colors.background }]}>
      {scroll ? <ScrollView contentContainerStyle={styles.scroll}>{content}</ScrollView> : content}
    </SafeAreaView>
  );
}

/** Screen title (Bricolage 30) with an optional subtitle, as in the mockups. */
export function ScreenTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  const theme = useTheme();
  return (
    <View style={styles.header}>
      <Text
        accessibilityRole="header"
        style={{
          color: theme.colors.text,
          fontFamily: theme.fonts.display,
          fontSize: theme.fontSizes.screenTitle,
          letterSpacing: -0.5,
        }}
      >
        {title}
      </Text>
      {subtitle !== undefined && (
        <Text
          style={{
            color: theme.colors.textMuted,
            fontFamily: theme.fonts.body,
            fontSize: theme.fontSizes.small,
          }}
        >
          {subtitle}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flexGrow: 1 },
  content: { flex: 1, paddingTop: 24, paddingHorizontal: 20, gap: 16 },
  header: { gap: 4 },
});
