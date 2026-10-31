import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, relative, sep } from 'node:path';

import { palettes } from '@etagere/shared';

import { ICON_BACKGROUND, iconPng, iconSvg } from './icon';
import { serviceWorkerSource } from './service-worker';

// Turns the Expo web export (`app/dist`) into the installable PWA served by the server:
// icons, web manifest, service worker, head tags, then a copy into `server/public`.

export const MANIFEST_FILE = 'manifest.webmanifest';
export const ICON_SIZES = [180, 192, 512] as const;
const MARKER = '<!-- etagere-pwa -->';

export function webManifest(): Record<string, unknown> {
  return {
    name: 'Étagère',
    short_name: 'Étagère',
    description: 'The household book library that stays at home.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: palettes.light.background,
    theme_color: ICON_BACKGROUND,
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
  };
}

/** Adds the manifest, icons, iOS home-screen tags and the service worker registration (once). */
export function injectPwaTags(html: string): string {
  if (html.includes(MARKER)) return html;
  const head = [
    MARKER,
    `<link rel="manifest" href="/${MANIFEST_FILE}">`,
    '<link rel="icon" type="image/svg+xml" href="/icons/icon.svg">',
    '<link rel="apple-touch-icon" href="/icons/icon-180.png">',
    '<meta name="mobile-web-app-capable" content="yes">',
    '<meta name="apple-mobile-web-app-capable" content="yes">',
    '<meta name="apple-mobile-web-app-title" content="Étagère">',
    '<meta name="apple-mobile-web-app-status-bar-style" content="default">',
    ...(/<meta[^>]+name=["']theme-color["']/i.test(html)
      ? []
      : [`<meta name="theme-color" content="${ICON_BACKGROUND}">`]),
  ].join('\n    ');
  // Service workers only run in a secure context (https or localhost): elsewhere this is a no-op.
  const register = `<script>if ('serviceWorker' in navigator && window.isSecureContext) {
      window.addEventListener('load', function () { navigator.serviceWorker.register('/sw.js').catch(function () {}); });
    }</script>`;
  if (!/<\/head>/i.test(html) || !/<\/body>/i.test(html)) {
    throw new Error('index.html has no </head> or </body>');
  }
  return html
    .replace(/<\/head>/i, `    ${head}\n  </head>`)
    .replace(/<\/body>/i, `    ${register}\n  </body>`);
}

/** Every file under `dir`, as URL paths (`/a/b.js`), without dotfiles nor AppleDouble files. */
export function listFiles(dir: string): string[] {
  const files: string[] = [];
  const walk = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const path = join(current, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile()) files.push(`/${relative(dir, path).split(sep).join('/')}`);
    }
  };
  walk(dir);
  return files.sort();
}

const SHELL_FILE = /^\/(_expo\/static\/.+|icons\/.+|favicon\.ico)$/;

/**
 * The files the service worker precaches: the page, its bundles, icons and manifest. Fonts and
 * images (every weight of the font packages is exported: megabytes) are cached on first use.
 */
export function shellFiles(files: readonly string[]): string[] {
  return ['/', `/${MANIFEST_FILE}`, ...files.filter((file) => SHELL_FILE.test(file))];
}

export interface BuildPwaResult {
  precache: string[];
  version: string;
}

/** Completes the export in `distDir`, then replaces `outDir` with a copy of it. */
export function buildPwa(distDir: string, outDir: string): BuildPwaResult {
  const indexPath = join(distDir, 'index.html');
  if (!existsSync(indexPath)) throw new Error(`No web export in ${distDir} (index.html missing)`);

  mkdirSync(join(distDir, 'icons'), { recursive: true });
  for (const size of ICON_SIZES) {
    writeFileSync(join(distDir, 'icons', `icon-${size}.png`), iconPng(size));
  }
  writeFileSync(join(distDir, 'icons', 'icon.svg'), iconSvg());
  writeFileSync(join(distDir, MANIFEST_FILE), `${JSON.stringify(webManifest(), null, 2)}\n`);
  writeFileSync(indexPath, injectPwaTags(readFileSync(indexPath, 'utf8')));

  // The cache version changes whenever any precached file changes.
  const precache = shellFiles(listFiles(distDir));
  const hash = createHash('sha256');
  for (const file of precache) {
    hash.update(file);
    hash.update(readFileSync(join(distDir, file === '/' ? 'index.html' : file.slice(1))));
  }
  const version = hash.digest('hex').slice(0, 12);
  writeFileSync(join(distDir, 'sw.js'), serviceWorkerSource(precache, version));

  rmSync(outDir, { recursive: true, force: true });
  cpSync(distDir, outDir, {
    recursive: true,
    filter: (source) => !source.split(sep).pop()?.startsWith('.'),
  });
  return { precache, version };
}
