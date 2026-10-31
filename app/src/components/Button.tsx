import { ActivityIndicator, Pressable, Text } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';

export type ButtonVariant = 'primary' | 'dark' | 'secondary' | 'link';

/**
 * The buttons of the design: primary (green, 54 px), dark (the "finish" action), secondary
 * (outlined, 48 px) and link (text only). Always at least 44 px tall.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  busy = false,
  accessibilityLabel,
  testID,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  busy?: boolean;
  accessibilityLabel?: string;
  testID?: string;
}) {
  const { colors, fonts, radii } = useTheme();
  const inactive = disabled || busy;
  const filled = variant === 'primary' || variant === 'dark';
  const background =
    variant === 'primary' ? colors.primary : variant === 'dark' ? colors.text : colors.surface;
  const foreground =
    variant === 'primary' ? colors.onPrimary : variant === 'dark' ? colors.background : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: inactive, busy }}
      disabled={inactive}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) =>
        variant === 'link'
          ? { minHeight: 44, justifyContent: 'center', alignSelf: 'center', paddingHorizontal: 8 }
          : {
              height: filled ? 54 : 48,
              borderRadius: radii.lg,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 16,
              backgroundColor:
                pressed && variant === 'primary' ? colors.primaryPressed : background,
              borderWidth: filled ? 0 : 1,
              borderColor: colors.border,
              opacity: inactive ? 0.55 : pressed ? 0.85 : 1,
            }
      }
    >
      {busy ? (
        <ActivityIndicator color={variant === 'link' ? colors.primary : foreground} />
      ) : (
        <Text
          style={{
            color: variant === 'link' ? colors.primary : foreground,
            fontFamily: variant === 'link' ? fonts.bodyMedium : fonts.bodySemiBold,
            fontSize: filled ? 16 : variant === 'link' ? 14 : 15,
          }}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}
