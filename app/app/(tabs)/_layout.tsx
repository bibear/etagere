import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';

import { Icon, type IconName } from '../../src/components/Icon';
import { useI18n } from '../../src/i18n/I18nProvider';
import { useTheme } from '../../src/theme/ThemeProvider';

const tabIcon =
  (name: IconName) =>
  ({ color }: { color: ColorValue }) => <Icon name={name} color={String(color)} />;

export default function TabsLayout() {
  const { colors, fonts } = useTheme();
  const { t } = useI18n();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          minHeight: 60,
        },
        tabBarLabelStyle: { fontFamily: fonts.bodySemiBold, fontSize: 12 },
        tabBarItemStyle: { minHeight: 52 },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: t('tabs.library'), tabBarIcon: tabIcon('library') }}
      />
      <Tabs.Screen
        name="readings"
        options={{ title: t('tabs.readings'), tabBarIcon: tabIcon('readings') }}
      />
      <Tabs.Screen name="scan" options={{ title: t('tabs.scan'), tabBarIcon: tabIcon('scan') }} />
      <Tabs.Screen
        name="for-you"
        options={{ title: t('tabs.forYou'), tabBarIcon: tabIcon('forYou') }}
      />
    </Tabs>
  );
}
