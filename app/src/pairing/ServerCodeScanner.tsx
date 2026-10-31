import { CameraView, useCameraPermissions } from 'expo-camera';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '../components/Button';
import { useI18n } from '../i18n/I18nProvider';
import { useTheme } from '../theme/ThemeProvider';

/** Native apps can pair by scanning the QR code the server prints at start. */
export const canScanServerCode = true;

export interface ServerCodeScannerProps {
  /** Raw payload of every QR code read (the screen checks it is a server address). */
  onCode(data: string): void;
  onCancel(): void;
  /** Stops decoding (while the scanned address is being tested). */
  paused?: boolean;
}

/** Back camera reading QR codes, shown inline in the server settings screen. */
export function ServerCodeScanner({ onCode, onCancel, paused = false }: ServerCodeScannerProps) {
  const { colors, fonts, radii } = useTheme();
  const { t } = useI18n();
  const [permission, requestPermission] = useCameraPermissions();
  const granted = permission?.granted ?? false;

  return (
    <View style={{ gap: 12 }}>
      {granted ? (
        <View
          style={[
            styles.frame,
            { borderRadius: radii.lg, backgroundColor: colors.scannerBackground },
          ]}
        >
          <CameraView
            testID="server-code-camera"
            style={StyleSheet.absoluteFill}
            facing="back"
            active={!paused}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={paused ? undefined : (result) => onCode(result.data)}
          />
        </View>
      ) : (
        permission && (
          <View style={{ gap: 10 }}>
            <Text style={{ color: colors.text, fontFamily: fonts.body, fontSize: 14 }}>
              {t('serverSettings.scanNeedsCamera')}
            </Text>
            {permission.canAskAgain && (
              <Button
                variant="secondary"
                label={t('serverSettings.scanAllowCamera')}
                onPress={() => void requestPermission()}
              />
            )}
          </View>
        )
      )}
      <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 13 }}>
        {t('serverSettings.scanHint')}
      </Text>
      <Button variant="link" label={t('serverSettings.scanCancel')} onPress={onCancel} />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: '100%', aspectRatio: 1, overflow: 'hidden' },
});
