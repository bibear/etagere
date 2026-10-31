import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { runInNewContext } from 'node:vm';

import { buildPwa, injectPwaTags, shellFiles, webManifest } from '../pwa/build';
import { iconPng, iconSvg } from '../pwa/icon';
import { serviceWorkerSource } from '../pwa/service-worker';

const INDEX =
  '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" /><meta name="theme-color" content="#fff"></head><body><div id="root"></div><script src="/_expo/static/js/web/entry-1.js" defer></script></body></html>';

describe('PWA build', () => {
  let root: string;
  let dist: string;
  let out: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'etagere-pwa-'));
    dist = join(root, 'dist');
    out = join(root, 'public');
    mkdirSync(join(dist, '_expo', 'static', 'js', 'web'), { recursive: true });
    mkdirSync(join(dist, 'assets', 'fonts'), { recursive: true });
    writeFileSync(join(dist, 'index.html'), INDEX);
    writeFileSync(join(dist, '_expo', 'static', 'js', 'web', 'entry-1.js'), 'run()');
    writeFileSync(join(dist, 'assets', 'fonts', 'Inter.ttf'), 'font');
    writeFileSync(join(dist, 'assets', 'logo.png'), 'png');
    writeFileSync(join(dist, '._index.html'), 'apple double');
    // A stale file from a previous build must disappear.
    mkdirSync(out);
    writeFileSync(join(out, 'stale.js'), 'old');
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('completes the export and copies it to the public dir', () => {
    const { precache, version } = buildPwa(dist, out);

    expect(precache).toEqual([
      '/',
      '/manifest.webmanifest',
      '/_expo/static/js/web/entry-1.js',
      '/icons/icon-180.png',
      '/icons/icon-192.png',
      '/icons/icon-512.png',
      '/icons/icon.svg',
    ]);
    expect(version).toMatch(/^[0-9a-f]{12}$/);
    for (const file of ['index.html', 'sw.js', 'manifest.webmanifest', 'icons/icon-512.png']) {
      expect(existsSync(join(out, file))).toBe(true);
    }
    expect(existsSync(join(out, 'stale.js'))).toBe(false);
    expect(existsSync(join(out, '._index.html'))).toBe(false);
    expect(readFileSync(join(out, 'sw.js'), 'utf8')).toContain(`etagere-shell-${version}`);
    const html = readFileSync(join(out, 'index.html'), 'utf8');
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest">');
    expect(JSON.parse(readFileSync(join(out, 'manifest.webmanifest'), 'utf8'))).toEqual(
      webManifest(),
    );
  });

  it('the cache version follows the content', () => {
    const first = buildPwa(dist, out).version;
    expect(buildPwa(dist, out).version).toBe(first);
    writeFileSync(join(dist, '_expo', 'static', 'js', 'web', 'entry-1.js'), 'run2()');
    expect(buildPwa(dist, out).version).not.toBe(first);
  });

  it('refuses a directory without a web export', () => {
    rmSync(join(dist, 'index.html'));
    expect(() => buildPwa(dist, out)).toThrow(/index\.html/);
  });

  it('injects the tags once and keeps an existing theme color', () => {
    const html = injectPwaTags(INDEX);
    expect(injectPwaTags(html)).toBe(html);
    expect(html.match(/name="theme-color"/g)).toHaveLength(1);
    expect(html).toContain('<link rel="apple-touch-icon" href="/icons/icon-180.png">');
    expect(html).toContain("navigator.serviceWorker.register('/sw.js')");
    expect(html.indexOf('rel="manifest"')).toBeLessThan(html.indexOf('</head>'));
    expect(injectPwaTags('<html><head></head><body></body></html>')).toContain(
      '<meta name="theme-color" content="#1F6B4A">',
    );
  });

  it('precaches only the shell', () => {
    expect(
      shellFiles(['/assets/fonts/Inter.ttf', '/assets/logo.png', '/favicon.ico', '/sw.js']),
    ).toEqual(['/', '/manifest.webmanifest', '/favicon.ico']);
  });

  it('manifest: installable, standalone, with a maskable icon', () => {
    expect(webManifest()).toMatchObject({
      name: 'Étagère',
      start_url: '/',
      display: 'standalone',
      theme_color: '#1F6B4A',
      background_color: '#F3F4F1',
    });
    expect(webManifest().icons).toContainEqual(
      expect.objectContaining({ sizes: '512x512', purpose: 'maskable' }),
    );
  });
});

describe('icon', () => {
  it.each([180, 192, 512])('is a valid %ipx RGB PNG', (size) => {
    const png = iconPng(size);
    expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]));
    expect(png.toString('ascii', 12, 16)).toBe('IHDR');
    expect(png.readUInt32BE(16)).toBe(size);
    expect(png.readUInt32BE(20)).toBe(size);
    const idatLength = png.readUInt32BE(33);
    expect(png.toString('ascii', 37, 41)).toBe('IDAT');
    const raw = inflateSync(png.subarray(41, 41 + idatLength));
    expect(raw.length).toBe((size * 3 + 1) * size);
    // Top-left pixel: the primary green.
    expect([...raw.subarray(1, 4)]).toEqual([0x1f, 0x6b, 0x4a]);
  });

  it('rejects absurd sizes', () => {
    expect(() => iconPng(0)).toThrow();
  });

  it('has an SVG version', () => {
    expect(iconSvg()).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
  });
});

describe('service worker', () => {
  type Listener = (event: Record<string, unknown>) => void;

  /** Runs the worker source against fake browser globals. */
  const boot = (options: { online: boolean }) => {
    const listeners: Record<string, Listener> = {};
    const stores = new Map<string, Map<string, string>>();
    const fetched: string[] = [];
    const response = (body: string) => ({ ok: true, body, clone: () => response(body) });
    const keyOf = (request: unknown) =>
      typeof request === 'string' ? request : new URL((request as { url: string }).url).pathname;
    const caches = {
      open: async (name: string) => {
        const store = stores.get(name) ?? new Map<string, string>();
        stores.set(name, store);
        return {
          addAll: async (urls: string[]) => urls.forEach((url) => store.set(url, `cached ${url}`)),
          match: async (request: unknown) => {
            const body = store.get(keyOf(request));
            return body === undefined ? undefined : response(body);
          },
          put: async (request: unknown, value: { body: string }) => {
            store.set(keyOf(request), value.body);
          },
        };
      },
      keys: async () => [...stores.keys()],
      delete: async (name: string) => stores.delete(name),
    };
    const fetch = async (request: { url: string }) => {
      fetched.push(request.url);
      if (!options.online) throw new TypeError('offline');
      return response(`network ${new URL(request.url).pathname}`);
    };
    const self = {
      location: { origin: 'http://192.168.1.20:4848' },
      addEventListener: (type: string, listener: Listener) => {
        listeners[type] = listener;
      },
      skipWaiting: async () => undefined,
      clients: { claim: async () => undefined },
    };
    runInNewContext(serviceWorkerSource(['/', '/_expo/static/js/web/entry-1.js'], 'v2'), {
      self,
      caches,
      fetch,
      URL,
      Response: { error: () => ({ ok: false, body: 'error' }) },
      Promise,
    });

    const run = async (type: string, extra: Record<string, unknown> = {}) => {
      let waited: Promise<unknown> | undefined;
      let responded: Promise<{ body: string }> | undefined;
      listeners[type]?.({
        ...extra,
        waitUntil: (promise: Promise<unknown>) => (waited = promise),
        respondWith: (promise: Promise<{ body: string }>) => (responded = promise),
      });
      await waited;
      return responded ? (await responded).body : undefined;
    };
    const request = (path: string, mode = 'cors', method = 'GET') => ({
      request: { url: `http://192.168.1.20:4848${path}`, mode, method },
    });
    return { run, request, stores, fetched };
  };

  it('precaches the shell on install and drops old caches on activate', async () => {
    const sw = boot({ online: true });
    sw.stores.set('etagere-shell-v1', new Map());
    sw.stores.set('other-app', new Map());
    await sw.run('install');
    await sw.run('activate');
    expect([...sw.stores.keys()].sort()).toEqual(['etagere-shell-v2', 'other-app']);
    expect([...(sw.stores.get('etagere-shell-v2')?.keys() ?? [])]).toEqual([
      '/',
      '/_expo/static/js/web/entry-1.js',
    ]);
  });

  it('never intercepts the API, other origins or mutations', async () => {
    const sw = boot({ online: true });
    expect(await sw.run('fetch', sw.request('/api/books'))).toBeUndefined();
    expect(await sw.run('fetch', sw.request('/books', 'cors', 'POST'))).toBeUndefined();
    expect(
      await sw.run('fetch', {
        request: { url: 'https://covers.openlibrary.org/x', method: 'GET' },
      }),
    ).toBeUndefined();
  });

  it('navigations: network first, the cached shell when offline', async () => {
    const online = boot({ online: true });
    expect(await online.run('fetch', online.request('/book/1', 'navigate'))).toBe(
      'network /book/1',
    );
    const offline = boot({ online: false });
    await offline.run('install');
    expect(await offline.run('fetch', offline.request('/book/1', 'navigate'))).toBe('cached /');
  });

  it('assets: cache first, fetched once then kept', async () => {
    const sw = boot({ online: true });
    await sw.run('install');
    expect(await sw.run('fetch', sw.request('/_expo/static/js/web/entry-1.js'))).toBe(
      'cached /_expo/static/js/web/entry-1.js',
    );
    expect(await sw.run('fetch', sw.request('/assets/logo.png'))).toBe('network /assets/logo.png');
    expect(await sw.run('fetch', sw.request('/assets/logo.png'))).toBe('network /assets/logo.png');
    expect(sw.fetched).toEqual(['http://192.168.1.20:4848/assets/logo.png']);
  });
});
