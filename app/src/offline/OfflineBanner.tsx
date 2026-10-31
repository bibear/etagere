import { StyleSheet, Text, View } from 'react-native';

import { useI18n } from '../i18n/I18nProvider';
import { useTheme } from '../theme/ThemeProvider';
import { useOffline } from './ServerStatus';

/** "Server unreachable — showing the last copy", shown at the top of screens while offline. */
export function OfflineBanner() {
  const offline = useOffline();
  const { colors, fonts, radii } = useTheme();
  const { t } = useI18n();
  if (!offline) return null;
  return (
    <View
      testID="offline-banner"
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[styles.banner, { backgroundColor: colors.busyBg, borderRadius: radii.md }]}
    >
      <View style={[styles.dot, { backgroundColor: colors.busyDot }]} />
      <Text style={[styles.text, { color: colors.busyFg, fontFamily: fonts.bodyMedium }]}>
        {t('server.unreachable')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  text: { flex: 1, fontSize: 14 },
});
