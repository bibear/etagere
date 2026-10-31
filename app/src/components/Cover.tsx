import { coverColorsFor } from '@etagere/shared';
import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';

export interface CoverProps {
  title: string;
  authors?: readonly string[];
  /** Absolute image URL (use `api.url(book.coverUrl)`), or null for a generated cover. */
  uri?: string | null;
  width?: number;
  height?: number;
  /** Hides title / author on small generated covers (lists). */
  compact?: boolean;
}

/**
 * A book cover: the downloaded image when there is one, else a generated cover in the design's
 * style (color picked from the title, title in Bricolage, author below). Decorative for screen
 * readers: the title is always rendered next to it.
 */
export function Cover({ title, authors = [], uri, width = 96, height = 136, compact }: CoverProps) {
  const theme = useTheme();
  const [failed, setFailed] = useState(false);
  const radius = width < 60 ? 4 : theme.radii.sm;

  if (uri && !failed) {
    return (
      <Image
        testID="cover-image"
        source={{ uri }}
        onError={() => setFailed(true)}
        accessibilityIgnoresInvertColors
        style={{ width, height, borderRadius: radius, backgroundColor: theme.colors.border }}
      />
    );
  }

  const colors = coverColorsFor(title);
  const scale = width / 110;
  return (
    <View
      testID="cover-generated"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.generated,
        { width, height, borderRadius: radius, backgroundColor: colors.background },
        { padding: Math.max(4, Math.round(10 * scale)) },
      ]}
    >
      {!compact && (
        <>
          <Text
            numberOfLines={4}
            style={{
              color: colors.foreground,
              fontFamily: theme.fonts.display,
              fontSize: Math.max(8, Math.round(13 * scale)),
              lineHeight: Math.max(9, Math.round(15 * scale)),
            }}
          >
            {title}
          </Text>
          {authors[0] !== undefined && (
            <Text
              numberOfLines={2}
              style={{
                color: colors.foreground,
                opacity: 0.85,
                fontFamily: theme.fonts.display,
                fontSize: Math.max(7, Math.round(10 * scale)),
              }}
            >
              {authors[0]}
            </Text>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  generated: { justifyContent: 'space-between', overflow: 'hidden' },
});
