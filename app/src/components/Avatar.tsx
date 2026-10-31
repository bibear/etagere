import { Text, View } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';

/** First letter of a name, upper-cased ("" for a blank name). */
export const initialOf = (name: string): string => name.trim().charAt(0).toLocaleUpperCase();

/** A profile's round avatar: its initial in white on its color. Decorative (name shown nearby). */
export function Avatar({
  name,
  color,
  size = 36,
  ringColor,
}: {
  name: string;
  color: string;
  size?: number;
  /** Border separating overlapping avatars (the screen background). */
  ringColor?: string;
}) {
  const theme = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: ringColor ? 2 : 0,
        borderColor: ringColor,
      }}
    >
      <Text
        style={{
          color: '#FFFFFF',
          fontFamily: theme.fonts.bodySemiBold,
          fontSize: Math.round(size * 0.4),
        }}
      >
        {initialOf(name)}
      </Text>
    </View>
  );
}
