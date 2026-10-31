import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';
import { Cover } from './Cover';

/**
 * A list line of the readings and recommendations screens: small cover, title (optionally
 * followed by the author), a muted second line and a trailing element.
 */
export function BookRow({
  title,
  authors,
  coverUri,
  inlineAuthor,
  subtitle,
  trailing,
  onPress,
  accessibilityLabel,
  testID,
}: {
  title: string;
  authors: string[];
  coverUri: string | null;
  /** Shown after the title ("La Peste · Camus"), as on the recommendations screen. */
  inlineAuthor?: string;
  subtitle: string;
  trailing?: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  testID?: string;
}) {
  const { colors, fonts } = useTheme();
  return (
    <Pressable
      accessibilityRole={onPress ? 'link' : undefined}
      accessibilityLabel={accessibilityLabel}
      disabled={!onPress}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <Cover title={title} authors={authors} uri={coverUri} width={40} height={60} compact />
      <View style={styles.text}>
        <Text
          numberOfLines={2}
          style={{ color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 15 }}
        >
          {title}
          {inlineAuthor ? (
            <Text style={{ color: colors.textMuted, fontFamily: fonts.body }}>
              {` · ${inlineAuthor}`}
            </Text>
          ) : null}
        </Text>
        <Text
          numberOfLines={2}
          style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 13 }}
        >
          {subtitle}
        </Text>
      </View>
      {trailing}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 10,
    minHeight: 64,
    borderBottomWidth: 1,
  },
  text: { flex: 1, gap: 2 },
});
