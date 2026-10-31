import { LIMITS, PROFILE_COLORS, type Profile, profileInputSchema } from '@etagere/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { type ReactNode, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { errorMessage } from '../api/errors';
import { listProfiles, putProfile, removeProfile } from '../api/profiles';
import { queryKeys } from '../api/queryKeys';
import { Avatar } from '../components/Avatar';
import { BackLink } from '../components/BackLink';
import { Button } from '../components/Button';
import { Screen, ScreenTitle } from '../components/Screen';
import { SectionLabel } from '../components/SectionLabel';
import { useI18n } from '../i18n/I18nProvider';
import { useSession } from '../session/SessionProvider';
import { useTheme } from '../theme/ThemeProvider';

function Card({ children, testID }: { children: ReactNode; testID?: string }) {
  const { colors, radii } = useTheme();
  return (
    <View
      testID={testID}
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.lg },
      ]}
    >
      {children}
    </View>
  );
}

function ErrorLine({ error }: { error: unknown }) {
  const { colors, fonts } = useTheme();
  const { t } = useI18n();
  return (
    <Text
      accessibilityRole="alert"
      style={{ color: colors.busyFg, fontFamily: fonts.bodyMedium, fontSize: 14 }}
    >
      {errorMessage(t, error)}
    </Text>
  );
}

/** Name and color of this device's profile. */
function MyProfile() {
  const { colors, fonts, radii } = useTheme();
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { api, profile, saveProfile } = useSession();
  const [name, setName] = useState(profile?.name ?? '');
  const [color, setColor] = useState(profile?.color ?? PROFILE_COLORS[0].value);
  const [saved, setSaved] = useState(false);

  const save = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error('no profile');
      const input = profileInputSchema.parse({ name, color });
      return putProfile(api, profile.id, input);
    },
    onSuccess: async (updated: Profile) => {
      await saveProfile({ id: updated.id, name: updated.name, color: updated.color });
      setName(updated.name);
      setSaved(true);
      // The name and color appear on books, readings and reviews: refresh everything.
      await queryClient.invalidateQueries();
    },
  });

  const valid = profileInputSchema.safeParse({ name, color }).success;
  const changed = name.trim() !== profile?.name || color !== profile?.color;

  return (
    <Card testID="my-profile">
      <View style={styles.identity}>
        <Avatar name={name || (profile?.name ?? '')} color={color} size={48} />
        <Text style={{ color: colors.text, fontFamily: fonts.display, fontSize: 20 }}>
          {name.trim() || profile?.name}
        </Text>
      </View>
      <Text style={{ color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 14 }}>
        {t('onboarding.firstNameLabel')}
      </Text>
      <TextInput
        accessibilityLabel={t('onboarding.firstNameLabel')}
        value={name}
        onChangeText={(value) => {
          setName(value);
          setSaved(false);
        }}
        maxLength={LIMITS.profileName}
        autoCapitalize="words"
        style={[
          styles.input,
          {
            color: colors.text,
            borderColor: colors.border,
            borderRadius: radii.md,
            fontFamily: fonts.body,
            backgroundColor: colors.background,
          },
        ]}
      />
      <Text style={{ color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 14 }}>
        {t('onboarding.colorLabel')}
      </Text>
      <View style={styles.swatches} accessibilityRole="radiogroup">
        {PROFILE_COLORS.map((option) => {
          // `swatch`, not `option.value` in the style (Reanimated treats `.value` specially).
          const swatch: string = option.value;
          const selected = swatch.toUpperCase() === color.toUpperCase();
          const label = t(`colors.${option.key}`);
          return (
            <Pressable
              key={option.key}
              accessibilityRole="radio"
              accessibilityLabel={selected ? t('colors.chosen', { color: label }) : label}
              accessibilityState={{ checked: selected }}
              onPress={() => {
                setColor(swatch);
                setSaved(false);
              }}
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
      <Button
        label={t('common.save')}
        onPress={() => save.mutate()}
        busy={save.isPending}
        disabled={!valid || !changed}
      />
      {saved && !changed && (
        <Text
          accessibilityRole="alert"
          style={{ color: colors.availableFg, fontFamily: fonts.bodyMedium, fontSize: 14 }}
        >
          {t('profile.saved')}
        </Text>
      )}
      {save.isError && <ErrorLine error={save.error} />}
    </Card>
  );
}

function MemberRow({ member, isMe }: { member: Profile; isMe: boolean }) {
  const { colors, fonts } = useTheme();
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { api } = useSession();
  const [confirming, setConfirming] = useState(false);

  const remove = useMutation({
    mutationFn: () => removeProfile(api, member.id),
    // Their current reading was put down and their name may show anywhere: refresh everything.
    onSuccess: () => queryClient.invalidateQueries(),
  });

  return (
    <View
      testID={`member-${member.id}`}
      style={[styles.member, { borderBottomColor: colors.border }]}
    >
      <View style={styles.memberLine}>
        <Avatar name={member.name} color={member.color} />
        <Text
          style={[styles.flex, { color: colors.text, fontFamily: fonts.bodyMedium, fontSize: 15 }]}
        >
          {isMe ? t('profile.youTag', { name: member.name }) : member.name}
        </Text>
        {!isMe && !confirming && (
          <Button
            variant="link"
            label={t('profile.remove')}
            accessibilityLabel={t('profile.removeLabel', { name: member.name })}
            onPress={() => setConfirming(true)}
          />
        )}
      </View>
      {confirming && (
        <View style={styles.confirm}>
          <Text style={{ color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 14 }}>
            {t('profile.removeConfirmTitle', { name: member.name })}
          </Text>
          <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 13 }}>
            {t('profile.removeConfirmBody')}
          </Text>
          <View style={styles.row}>
            <View style={styles.flex}>
              <Button
                variant="secondary"
                label={t('common.cancel')}
                onPress={() => {
                  remove.reset();
                  setConfirming(false);
                }}
              />
            </View>
            <View style={styles.flex}>
              <Button
                variant="dark"
                label={t('profile.removeConfirm')}
                onPress={() => remove.mutate()}
                busy={remove.isPending}
              />
            </View>
          </View>
          {remove.isError && <ErrorLine error={remove.error} />}
        </View>
      )}
    </View>
  );
}

function Household() {
  const { colors, fonts } = useTheme();
  const { t } = useI18n();
  const { api, profile, serverUrl } = useSession();
  const members = useQuery({
    queryKey: [...queryKeys.profiles, serverUrl],
    queryFn: () => listProfiles(api),
  });

  return (
    <View style={styles.section}>
      <SectionLabel label={t('profile.household')} />
      <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 13 }}>
        {t('profile.householdHint')}
      </Text>
      {members.isPending ? (
        <ActivityIndicator accessibilityLabel={t('common.loading')} color={colors.textMuted} />
      ) : members.isError ? (
        <>
          <ErrorLine error={members.error} />
          <Button variant="secondary" label={t('common.retry')} onPress={() => members.refetch()} />
        </>
      ) : (
        <Card>
          {members.data.map((member) => (
            <MemberRow key={member.id} member={member} isMe={member.id === profile?.id} />
          ))}
        </Card>
      )}
    </View>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  const { colors, fonts } = useTheme();
  return (
    <View style={styles.info} accessible accessibilityLabel={`${label}, ${value}`}>
      <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 13 }}>{label}</Text>
      <Text style={{ color: colors.text, fontFamily: fonts.bodyMedium, fontSize: 15 }}>
        {value}
      </Text>
    </View>
  );
}

function ServerAndApp() {
  const { scheme } = useTheme();
  const { t } = useI18n();
  const { api, serverUrl } = useSession();
  const health = useQuery({ queryKey: queryKeys.health(serverUrl), queryFn: () => api.health() });

  return (
    <>
      <View style={styles.section}>
        <SectionLabel label={t('profile.server')} />
        <Card>
          <InfoLine
            label={health.data?.householdName ?? t('common.appName')}
            value={serverUrl.replace(/^https?:\/\//, '')}
          />
          <Button
            variant="secondary"
            label={t('profile.changeServer')}
            onPress={() => router.push('/server')}
          />
        </Card>
      </View>
      <View style={styles.section}>
        <SectionLabel label={t('profile.app')} />
        <Card>
          <InfoLine label={t('profile.language')} value={t('profile.languageValue')} />
          <InfoLine
            label={t('profile.theme')}
            value={scheme === 'dark' ? t('profile.themeDark') : t('profile.themeLight')}
          />
        </Card>
      </View>
    </>
  );
}

/** Profile settings: my name and color, the household members, the server, language and theme. */
export function ProfileScreen() {
  const { t } = useI18n();
  return (
    <Screen>
      <BackLink label={t('book.back')} />
      <ScreenTitle title={t('profile.title')} />
      <View style={styles.section}>
        <SectionLabel label={t('profile.you')} />
        <MyProfile />
      </View>
      <Household />
      <ServerAndApp />
      <View style={styles.bottom} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  section: { gap: 10 },
  card: { gap: 12, padding: 16, borderWidth: 1 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  input: { borderWidth: 1, minHeight: 48, paddingHorizontal: 12, fontSize: 15 },
  swatches: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  member: { gap: 10, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  memberLine: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  confirm: { gap: 8 },
  row: { flexDirection: 'row', gap: 10 },
  info: { gap: 2 },
  bottom: { height: 24 },
});
