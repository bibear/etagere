import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useI18n } from '../i18n/I18nProvider';
import { useTheme } from '../theme/ThemeProvider';

/** Lines shown while the back-cover text is collapsed. */
export const COLLAPSED_LINES = 6;

/** Beyond this, the text may not fit in the collapsed lines: offer "Read more". */
const LONG_TEXT = 280;

/**
 * "Back cover" section of the book detail (style of the design's sections): the description,
 * collapsed to ~6 lines with "Read more". Nothing when the book has no description.
 */
export function BackCover({ text }: { text: string | null }) {
  const { colors, fonts } = useTheme();
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  if (text === null || text.trim() === '') return null;
  const long = text.length > LONG_TEXT || text.split('\n').length > COLLAPSED_LINES;

  return (
    <View testID="back-cover" style={styles.section}>
      <Text
        accessibilityRole="header"
        style={{ color: colors.text, fontFamily: fonts.display, fontSize: 20 }}
      >
        {t('book.backCover')}
      </Text>
      <Text
        testID="back-cover-text"
        numberOfLines={long && !expanded ? COLLAPSED_LINES : undefined}
        style={{ color: colors.text, fontFamily: fonts.body, fontSize: 15, lineHeight: 23 }}
      >
        {text}
      </Text>
      {long && (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          onPress={() => setExpanded((value) => !value)}
          style={styles.toggle}
        >
          <Text style={{ color: colors.primary, fontFamily: fonts.bodySemiBold, fontSize: 14 }}>
            {expanded ? t('book.readLess') : t('book.readMore')}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10 },
  toggle: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
});
