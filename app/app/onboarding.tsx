import { PROFILE_COLORS, profileInputSchema } from '@etagere/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Rect } from 'react-native-svg';

import { errorMessage } from '../src/api/errors';
import { putProfile } from '../src/api/profiles';
import { queryKeys } from '../src/api/queryKeys';
import { Button } from '../src/components/Button';
import { useI18n } from '../src/i18n/I18nProvider';
import { newProfileId, useSession } from '../src/session/SessionProvider';
import { useTheme } from '../src/theme/ThemeProvider';

const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
};

/** Card "Library found · etagere.local · 128 books · 4 members" (or the not-found state). */
function ServerCard() {
  const { colors, fonts, radii } = useTheme();
  const { t } = useI18n();
  const { api, serverUrl } = useSession();
  const info = useQuery({
    queryKey: queryKeys.serverInfo(serverUrl),
    queryFn: () => api.serverInfo(),
    retry: false,
  });

  const found = info.isSuccess;
  const title = info.isPending
    ? t('onboarding.searching')
    : found
      ? t('onboarding.libraryFound')
      : t('onboarding.libraryNotFound');
  const detail = found
    ? t('onboarding.libraryStats', {
        host: hostOf(serverUrl),
        books: t('library.bookCount', { count: info.data.bookCount }),
        count: info.data.profileCount,
      })
    : info.isError
      ? t('onboarding.libraryNotFoundHint')
      : hostOf(serverUrl);

  return (
    <View
      testID="server-card"
      accessible
      accessibilityLabel={`${title}. ${detail}`}
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.lg },
      ]}
    >
      <View
        style={[
          styles.cardIcon,
          { backgroundColor: found ? colors.availableBg : colors.busyBg, borderRadius: radii.md },
        ]}
      >
        <Svg
          width={22}
          height={22}
          viewBox="0 0 24 24"
          fill="none"
          stroke={found ? colors.availableFg : colors.busyFg}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <Rect x={3} y={4} width={18} height={12} rx={2} />
          <Path d="M8 20h8M12 16v4" />
        </Svg>
      </View>
      <View style={styles.cardText}>
        <Text style={{ color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 15 }}>
          {title}
        </Text>
        <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 13 }}>
          {detail}
        </Text>
      </View>
      {info.isPending ? (
        <ActivityIndicator color={colors.textMuted} />
      ) : (
        <View
          style={[styles.dot, { backgroundColor: found ? colors.availableDot : colors.busyDot }]}
        />
      )}
    </View>
  );
}

/** First launch (design screen 1): server card, first name, color, "Enter the library". */
export default function OnboardingScreen() {
  const theme = useTheme();
  const { colors, fonts, radii } = theme;
  const { t } = useI18n();
  const { api, saveProfile } = useSession();
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(PROFILE_COLORS[0].value);

  const enter = useMutation({
    mutationFn: async () => {
      const input = profileInputSchema.parse({ name, color });
      const id = newProfileId();
      const profile = await putProfile(api, id, input);
      await saveProfile({ id: profile.id, name: profile.name, color: profile.color });
    },
    onSuccess: () => router.replace('/'),
  });

  const canEnter = profileInputSchema.safeParse({ name, color }).success;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.intro}>
          <View style={[styles.logo, { backgroundColor: colors.primary }]}>
            <Svg
              width={30}
              height={30}
              viewBox="0 0 24 24"
              fill="none"
              stroke={colors.onPrimary}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <Path d="M4 20h16" />
              <Path d="M6 20V6h3v14" />
              <Path d="M10 20V4h3v16" />
              <Path d="M14.5 7.5l2.9-.8 3.1 12.5-2.9.8z" />
            </Svg>
          </View>
          <Text
            accessibilityRole="header"
            style={{
              color: colors.text,
              fontFamily: fonts.display,
              fontSize: 34,
              letterSpacing: -0.6,
              lineHeight: 37,
            }}
          >
            {t('onboarding.title')}
          </Text>
          <Text
            style={{
              color: colors.textMuted,
              fontFamily: fonts.body,
              fontSize: 16,
              lineHeight: 24,
            }}
          >
            {t('onboarding.subtitle')}
          </Text>
        </View>

        <ServerCard />

        <View style={styles.field}>
          <Text
            nativeID="first-name-label"
            style={{ color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 14 }}
          >
            {t('onboarding.firstNameLabel')}
          </Text>
          <TextInput
            accessibilityLabel={t('onboarding.firstNameLabel')}
            accessibilityLabelledBy="first-name-label"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            autoComplete="given-name"
            maxLength={40}
            returnKeyType="done"
            style={{
              height: 52,
              paddingHorizontal: 16,
              borderWidth: 1.5,
              borderColor: name ? colors.primary : colors.border,
              borderRadius: radii.md,
              backgroundColor: colors.surface,
              color: colors.text,
              fontFamily: fonts.body,
              fontSize: 16,
            }}
          />
          <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 13 }}>
            {t('onboarding.firstNameHint')}
          </Text>
        </View>

        <View style={styles.colorField}>
          <Text style={{ color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 14 }}>
            {t('onboarding.colorLabel')}
          </Text>
          <View style={styles.swatches} accessibilityRole="radiogroup">
            {PROFILE_COLORS.map((option) => {
              // Named `swatch`, not `option.value` inside the style: the Reanimated Babel plugin
              // treats `.value` in styles as a shared value.
              const swatch: string = option.value;
              const selected = swatch === color;
              const label = t(`colors.${option.key}`);
              return (
                <Pressable
                  key={option.key}
                  accessibilityRole="radio"
                  accessibilityLabel={selected ? t('colors.chosen', { color: label }) : label}
                  accessibilityState={{ checked: selected }}
                  onPress={() => setColor(swatch)}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 22,
                    backgroundColor: swatch,
                    borderWidth: selected ? 3 : 0,
                    borderColor: colors.text,
                  }}
                />
              );
            })}
          </View>
        </View>

        <View style={styles.spacer} />

        <View style={styles.footer}>
          <Text
            style={{
              color: colors.textMuted,
              fontFamily: fonts.body,
              fontSize: 13,
              lineHeight: 19,
              textAlign: 'center',
            }}
          >
            {t('onboarding.privacyNote')}
          </Text>
          {enter.isError && (
            <Text
              accessibilityRole="alert"
              style={{ color: colors.busyFg, fontFamily: fonts.bodyMedium, textAlign: 'center' }}
            >
              {errorMessage(t, enter.error)}
            </Text>
          )}
          <Button
            label={t('onboarding.enter')}
            onPress={() => enter.mutate()}
            disabled={!canEnter}
            busy={enter.isPending}
          />
          <Button
            variant="link"
            label={t('onboarding.enterServerAddress')}
            onPress={() => router.push('/server')}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flexGrow: 1, paddingTop: 48, paddingHorizontal: 24, paddingBottom: 32, gap: 28 },
  intro: { gap: 16 },
  logo: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderWidth: 1 },
  cardIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  cardText: { flex: 1, gap: 2 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  field: { gap: 8 },
  colorField: { gap: 10 },
  swatches: { flexDirection: 'row', gap: 12 },
  spacer: { flex: 1 },
  footer: { gap: 14 },
});
