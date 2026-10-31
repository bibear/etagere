import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Store and EAS readiness: the native build settings the app depends on (D-12) and the assets.

const appDir = join(__dirname, '..', '..');
const readJson = (path: string) => JSON.parse(readFileSync(join(appDir, path), 'utf8'));
const { expo } = readJson('app.json');
const plugin = (name: string) =>
  (expo.plugins as unknown[]).find((entry) => Array.isArray(entry) && entry[0] === name) as
    [string, Record<string, unknown>] | undefined;

/** Width and height from a PNG header, and whether it has an alpha channel. */
function pngInfo(path: string) {
  const bytes = readFileSync(join(appDir, path));
  expect(bytes.subarray(0, 8)).toEqual(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  );
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), alpha: bytes[25] === 6 };
}

describe('EAS builds', () => {
  const eas = readJson('eas.json');

  it('builds an installable APK for GitHub Releases with the preview profile', () => {
    expect(eas.build.preview).toMatchObject({
      distribution: 'internal',
      android: { buildType: 'apk' },
    });
  });

  it('builds store bundles with the production profile', () => {
    expect(eas.build.production.android.buildType).toBe('app-bundle');
    expect(eas.build.production.autoIncrement).toBe(true);
    expect(eas.cli.appVersionSource).toBe('remote');
  });
});

describe('plain HTTP to the home server', () => {
  it('allows cleartext traffic on Android', () => {
    expect(plugin('expo-build-properties')?.[1]).toEqual({
      android: { usesCleartextTraffic: true },
    });
  });

  it('allows local networking on iOS and explains it', () => {
    expect(expo.ios.infoPlist.NSAppTransportSecurity).toEqual({ NSAllowsLocalNetworking: true });
    expect(expo.ios.infoPlist.NSLocalNetworkUsageDescription).toMatch(/Wi-Fi/);
  });
});

describe('permission texts', () => {
  it.each([
    ['fr', 'Étagère utilise la caméra'],
    ['en', 'Étagère uses the camera'],
  ])('explains the camera and the local network in %s', (locale, camera) => {
    const strings = readJson(expo.locales[locale]).ios;
    expect(strings.NSCameraUsageDescription).toContain(camera);
    expect(strings.NSLocalNetworkUsageDescription).toMatch(/Wi-Fi/);
    expect(strings.CFBundleDisplayName).toBe('Étagère');
  });

  it('defaults to the English camera text and records no audio', () => {
    const camera = plugin('expo-camera')?.[1];
    expect(camera?.cameraPermission).toBe(readJson('locales/en.json').ios.NSCameraUsageDescription);
    expect(camera).toMatchObject({ microphonePermission: false, recordAudioAndroid: false });
    expect(expo.android.blockedPermissions).toContain('android.permission.RECORD_AUDIO');
  });
});

describe('icons and splash', () => {
  it('has a 1024 px opaque app icon (App Store rule)', () => {
    expect(expo.icon).toBe('./assets/icon.png');
    expect(pngInfo(expo.icon)).toEqual({ width: 1024, height: 1024, alpha: false });
  });

  it('has an Android adaptive icon on the primary green', () => {
    expect(expo.android.adaptiveIcon.backgroundColor).toBe('#1F6B4A');
    expect(pngInfo(expo.android.adaptiveIcon.foregroundImage)).toMatchObject({
      width: 1024,
      height: 1024,
    });
  });

  it('shows the icon on the light and dark backgrounds of the theme at launch', () => {
    const splash = plugin('expo-splash-screen')?.[1] as {
      image: string;
      backgroundColor: string;
      dark: { backgroundColor: string };
    };
    expect(splash.backgroundColor).toBe('#F3F4F1');
    expect(splash.dark.backgroundColor).toBe('#0F1513');
    expect(pngInfo(splash.image).width).toBeGreaterThanOrEqual(360);
  });
});
