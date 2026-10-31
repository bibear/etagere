import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { type TestApp, buildTestApp } from './support/test-app';

const INDEX = '<!doctype html><html><head><title>Étagère</title></head><body>app</body></html>';

describe('PWA served by the server', () => {
  let publicDir: string;
  let t: TestApp;

  beforeAll(() => {
    publicDir = mkdtempSync(join(tmpdir(), 'etagere-public-'));
    mkdirSync(join(publicDir, '_expo', 'static', 'js', 'web'), { recursive: true });
    writeFileSync(join(publicDir, 'index.html'), INDEX);
    writeFileSync(join(publicDir, '_expo', 'static', 'js', 'web', 'entry-abc123.js'), 'run()');
    writeFileSync(join(publicDir, 'sw.js'), '/* sw */');
    writeFileSync(join(publicDir, 'manifest.webmanifest'), '{"name":"Étagère"}');
    writeFileSync(join(publicDir, '.secret'), 'nope');
    writeFileSync(join(publicDir, '._index.html'), 'apple double');
  });
  afterAll(() => rmSync(publicDir, { recursive: true, force: true }));

  beforeEach(() => {
    t = buildTestApp({ publicDir });
  });
  afterEach(() => t.close());

  const get = (url: string, remoteAddress = '192.168.1.20') =>
    t.app.inject({ method: 'GET', url, remoteAddress });

  it('serves the app at /', async () => {
    const response = await get('/');
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toMatch(/^text\/html/);
    expect(response.headers['cache-control']).toBe('no-cache');
    expect(response.body).toBe(INDEX);
  });

  it.each(['/book/0b3f6a9e-4c1d-4e8a-9f2b-7d5c3a1e9b04', '/readings', '/for-you?tab=1'])(
    'falls back to index.html for the app route %s',
    async (url) => {
      const response = await get(url);
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toMatch(/^text\/html/);
      expect(response.body).toBe(INDEX);
    },
  );

  it('HEAD of an app route answers too', async () => {
    const response = await t.app.inject({ method: 'HEAD', url: '/readings' });
    expect(response.statusCode).toBe(200);
  });

  it('hashed bundles are cached for a year, the rest revalidated', async () => {
    const bundle = await get('/_expo/static/js/web/entry-abc123.js');
    expect(bundle.statusCode).toBe(200);
    expect(bundle.body).toBe('run()');
    expect(bundle.headers['cache-control']).toBe('public, max-age=31536000, immutable');

    const worker = await get('/sw.js');
    expect(worker.statusCode).toBe(200);
    expect(worker.headers['content-type']).toMatch(/javascript/);
    expect(worker.headers['cache-control']).toBe('no-cache');

    const manifest = await get('/manifest.webmanifest');
    expect(manifest.headers['content-type']).toMatch(/^application\/manifest\+json/);
  });

  it('keeps the API answers: unknown /api routes stay JSON 404', async () => {
    for (const url of ['/api/nope', '/api']) {
      const response = await get(url);
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ code: 'not_found' });
    }
    expect((await get('/api/health')).json()).toMatchObject({ status: 'ok' });
  });

  it('a missing file is a 404, not the app', async () => {
    const response = await get('/_expo/static/js/web/missing.js');
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ code: 'not_found' });
  });

  it('a POST to an app route is a 404', async () => {
    const response = await t.app.inject({ method: 'POST', url: '/readings' });
    expect(response.statusCode).toBe(404);
  });

  it.each(['/.secret', '/._index.html', '/../package.json', '/%2e%2e/%2e%2e/etc/passwd'])(
    'never serves %s',
    async (url) => {
      const response = await get(url);
      // Either refused or the app page itself (SPA fallback), never the file.
      if (response.statusCode === 200) expect(response.body).toBe(INDEX);
      else expect(response.json()).toEqual({ code: 'not_found' });
    },
  );

  it('the LAN guard covers the app too', async () => {
    const response = await get('/', '8.8.8.8');
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ code: 'outside_lan' });
  });

  it('without an exported app the server is API only', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'etagere-empty-'));
    const apiOnly = buildTestApp({ publicDir: empty });
    try {
      for (const url of ['/', '/readings']) {
        const response = await apiOnly.app.inject({ method: 'GET', url });
        expect(response.statusCode).toBe(404);
        expect(response.json()).toEqual({ code: 'not_found' });
      }
    } finally {
      await apiOnly.close();
      rmSync(empty, { recursive: true, force: true });
    }
  });
});
