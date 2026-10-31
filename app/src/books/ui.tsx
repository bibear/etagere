import { StyleSheet, Text, TextInput, type TextInputProps, View } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';

/** A labelled text input with an optional hint and error, as used by the book form. */
export function FormField({
  label,
  hint,
  error,
  multiline,
  ...input
}: { label: string; hint?: string; error?: string } & TextInputProps) {
  const { colors, fonts, fontSizes, radii } = useTheme();
  return (
    <View style={styles.field}>
      <Text
        style={{ color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: fontSizes.small }}
      >
        {label}
      </Text>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={hint}
        placeholderTextColor={colors.textMuted}
        multiline={multiline}
        {...input}
        style={[
          styles.input,
          multiline && styles.multiline,
          {
            borderColor: error ? colors.busyDot : colors.border,
            backgroundColor: colors.surface,
            color: colors.text,
            fontFamily: fonts.body,
            borderRadius: radii.md,
          },
        ]}
      />
      {error !== undefined ? (
        <Text
          accessibilityRole="alert"
          style={{
            color: colors.busyFg,
            fontFamily: fonts.bodyMedium,
            fontSize: fontSizes.caption,
          }}
        >
          {error}
        </Text>
      ) : (
        hint !== undefined && (
          <Text
            style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: fontSizes.caption }}
          >
            {hint}
          </Text>
        )
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  input: { minHeight: 48, borderWidth: 1, paddingHorizontal: 14, fontSize: 16 },
  multiline: { minHeight: 120, paddingTop: 12, textAlignVertical: 'top' },
});
