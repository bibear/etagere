import type { HealthResponse } from '@etagere/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { errorMessage } from '../src/api/errors';
import { BackLink } from '../src/components/BackLink';
import { Button } from '../src/components/Button';
import { Screen, ScreenTitle } from '../src/components/Screen';
import { useI18n } from '../src/i18n/I18nProvider';
import { ServerCodeScanner, canScanServerCode } from '../src/pairing/ServerCodeScanner';
import { serverUrlFromCode } from '../src/pairing/discovery';
import { useSession } from '../src/session/SessionProvider';
import { normalizeServerUrl } from '../src/session/serverUrl';
import { useTheme } from '../src/theme/ThemeProvider';

/** Thrown when the typed text is not an address at all. */
class InvalidAddress extends Error {}
/** Thrown when a scanned QR code is not a server address. */
class NotServerCode extends Error {}

const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));

/** Server settings: type the address of the home server (or scan its QR code), test it, save it. */
export default function ServerSettingsScreen() {
  const { colors, fonts, radii } = useTheme();
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { api, serverUrl, hasSavedServerUrl, saveServerUrl } = useSession();
  const [address, setAddress] = useState(serverUrl);
  const [scanning, setScanning] = useState(false);

  /** Normalises the address and calls its `/api/health`. */
  const probe = async (typed: string): Promise<{ url: string; health: HealthResponse }> => {
    const url = normalizeServerUrl(typed);
    if (!url) throw new InvalidAddress();
    const health = await api.withBaseUrl(url).health();
    return { url, health };
  };

  const test = useMutation({ mutationFn: () => probe(address) });
  const save = useMutation({
    /** Saves the typed address, or the one read from a QR code. */
    mutationFn: async (scanned?: string) => {
      let typed = address;
      if (scanned !== undefined) {
        const fromCode = serverUrlFromCode(scanned);
        if (!fromCode) throw new NotServerCode();
        typed = fromCode;
      }
      const { url } = await probe(typed);
      await saveServerUrl(url);
    },
    onSuccess: () => {
      // Data from another server must not leak into this one.
      queryClient.clear();
      leave();
    },
  });
  const reset = useMutation({
    mutationFn: () => saveServerUrl(null),
    onSuccess: () => {
      queryClient.clear();
      leave();
    },
  });

  const failure = save.error ?? test.error;
  const failureText = !failure
    ? null
    : failure instanceof InvalidAddress
      ? t('serverSettings.invalidAddress')
      : failure instanceof NotServerCode
        ? t('serverSettings.notServerCode')
        : errorMessage(t, failure);
  const lastResult = test.data;

  const onScanned = (data: string) => {
    if (save.isPending) return;
    const url = serverUrlFromCode(data);
    if (url) setAddress(url);
    test.reset();
    save.mutate(data);
  };

  const onChange = (text: string) => {
    setAddress(text);
    test.reset();
    save.reset();
  };

  return (
    <Screen>
      <BackLink label={t('common.close')} />
      <ScreenTitle title={t('serverSettings.title')} subtitle={t('serverSettings.subtitle')} />
      <View style={{ gap: 8 }}>
        <Text style={{ color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 14 }}>
          {t('serverSettings.addressLabel')}
        </Text>
        <TextInput
          accessibilityLabel={t('serverSettings.addressLabel')}
          value={address}
          onChangeText={onChange}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          inputMode="url"
          returnKeyType="go"
          onSubmitEditing={() => save.mutate(undefined)}
          style={{
            height: 52,
            paddingHorizontal: 16,
            borderWidth: 1.5,
            borderColor: colors.border,
            borderRadius: radii.md,
            backgroundColor: colors.surface,
            color: colors.text,
            fontFamily: fonts.body,
            fontSize: 16,
          }}
        />
        <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 13 }}>
          {t('serverSettings.addressHint')}
        </Text>
      </View>

      {canScanServerCode &&
        (scanning ? (
          <ServerCodeScanner
            onCode={onScanned}
            onCancel={() => setScanning(false)}
            paused={save.isPending}
          />
        ) : (
          <Button
            variant="secondary"
            label={t('serverSettings.scanCode')}
            onPress={() => {
              test.reset();
              save.reset();
              setScanning(true);
            }}
          />
        ))}

      {failureText !== null && (
        <Text
          accessibilityRole="alert"
          style={{ color: colors.busyFg, fontFamily: fonts.bodyMedium, fontSize: 14 }}
        >
          {failureText}
        </Text>
      )}
      {lastResult && !failure && (
        <Text
          accessibilityLiveRegion="polite"
          style={{ color: colors.availableFg, fontFamily: fonts.bodyMedium, fontSize: 14 }}
        >
          {t('serverSettings.found', {
            name: lastResult.health.householdName,
            version: lastResult.health.version,
          })}
        </Text>
      )}

      <View style={{ gap: 10 }}>
        <Button
          label={t('serverSettings.saveAndUse')}
          onPress={() => save.mutate(undefined)}
          busy={save.isPending}
          disabled={test.isPending}
        />
        <Button
          variant="secondary"
          label={t('serverSettings.test')}
          onPress={() => test.mutate()}
          busy={test.isPending}
          disabled={save.isPending}
        />
        {hasSavedServerUrl && (
          <Button
            variant="link"
            label={t('serverSettings.useDefault')}
            onPress={() => reset.mutate()}
          />
        )}
      </View>
    </Screen>
  );
}
