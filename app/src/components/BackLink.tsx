import { router } from 'expo-router';
import { Pressable, Text } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';
import { Icon } from './Icon';

/** "‹ Library" link at the top of stack screens; goes back, or to `fallback` when opened directly. */
export function BackLink({ label, fallback = '/' }: { label: string; fallback?: string }) {
  const { colors, fonts } = useTheme();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label}
      onPress={() => (router.canGoBack() ? router.back() : router.replace(fallback as '/'))}
      style={{
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        minHeight: 44,
      }}
    >
      <Icon name="back" size={20} color={colors.primary} />
      <Text style={{ color: colors.primary, fontFamily: fonts.bodyMedium, fontSize: 15 }}>
        {label}
      </Text>
    </Pressable>
  );
}
