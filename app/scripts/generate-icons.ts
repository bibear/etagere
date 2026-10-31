import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { iconPng } from '../../server/src/pwa/icon';

// Native app icons and splash image, drawn by the same code as the PWA icon (one brand, no
// design tool needed). Run after changing server/src/pwa/icon.ts: `npm run icons -w @etagere/app`.

/** File name → [size in pixels, drawing scale]. */
export const APP_ICONS: Record<string, [number, number]> = {
  // iOS and Android legacy icon: full drawing (iOS rounds the corners itself).
  'icon.png': [1024, 1],
  // Android adaptive icon foreground: the launcher crops up to a 61 % circle.
  'adaptive-icon.png': [1024, 0.72],
  // Splash screen image, shown at 120 dp on the theme background.
  'splash-icon.png': [512, 1],
};

const assetsDir = join(__dirname, '..', 'assets');
for (const [file, [size, scale]] of Object.entries(APP_ICONS)) {
  writeFileSync(join(assetsDir, file), iconPng(size, scale));
  console.log(`assets/${file} (${size}×${size})`);
}
