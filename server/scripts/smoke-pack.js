/* global fetch, setTimeout */
// Smoke test of the npm package as users get it: `npm pack` (runs prepack: bundle + PWA +
// LICENSE), check the tarball contents, install it in an empty project, start the bin and call
// it. Needs the npm registry (dependencies are installed); not part of `npm run check`.
//
// Usage: npm run smoke:pack -w etagere-server
const { execFileSync, spawn } = require('node:child_process');
const { mkdirSync, mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const { createServer } = require('node:net');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');

const serverDir = resolve(__dirname, '..');
const windows = process.platform === 'win32';
const npm = (args, cwd) =>
  execFileSync(windows ? 'npm.cmd' : 'npm', args, { cwd, encoding: 'utf8', shell: windows });

const REQUIRED = [
  'package/dist/index.js',
  'package/public/index.html',
  'package/LICENSE',
  'package/README.md',
  'package/package.json',
];

function freePort() {
  return new Promise((done, fail) => {
    const probe = createServer();
    probe.once('error', fail);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => done(port));
    });
  });
}

async function waitFor(url, attempts = 40) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch {
      // not listening yet
    }
    await new Promise((done) => setTimeout(done, 250));
  }
  throw new Error(`${url} never answered`);
}

async function main() {
  const work = mkdtempSync(join(tmpdir(), 'etagere-smoke-'));
  let child;
  try {
    console.log('Packing…');
    const [packed] = JSON.parse(npm(['pack', '--json', '--pack-destination', work], serverDir));
    const files = packed.files.map((file) => `package/${file.path}`);
    const missing = REQUIRED.filter((file) => !files.includes(file));
    if (missing.length > 0) throw new Error(`Missing from the tarball: ${missing.join(', ')}`);
    const unexpected = files.filter((file) => /\/(src|scripts)\/|\/\._/.test(file));
    if (unexpected.length > 0)
      throw new Error(`Unexpected in the tarball: ${unexpected.join(', ')}`);
    console.log(`${packed.filename}: ${files.length} files, ${(packed.size / 1024).toFixed(0)} kB`);

    const project = join(work, 'project');
    mkdirSync(project);
    writeFileSync(join(project, 'package.json'), '{ "private": true }\n');
    console.log('Installing the tarball in an empty project…');
    npm(['install', '--no-audit', '--no-fund', join(work, packed.filename)], project);

    const port = await freePort();
    const bin = join(
      project,
      'node_modules',
      '.bin',
      windows ? 'etagere-server.cmd' : 'etagere-server',
    );
    child = spawn(bin, [], {
      cwd: project,
      env: {
        ...process.env,
        PORT: String(port),
        ETAGERE_DATA_DIR: join(work, 'data'),
        ETAGERE_MDNS: '0',
      },
      stdio: ['ignore', 'inherit', 'inherit'],
      shell: windows,
    });
    const health = await (await waitFor(`http://127.0.0.1:${port}/api/health`)).json();
    if (health.status !== 'ok' || health.version !== packed.version) {
      throw new Error(`Unexpected health: ${JSON.stringify(health)}`);
    }
    const home = await fetch(`http://127.0.0.1:${port}/`);
    const html = await home.text();
    if (home.status !== 200 || !html.includes('<div id="root">')) {
      throw new Error(`The web app is not served at / (status ${home.status})`);
    }
    console.log(`OK: etagere-server ${health.version} answers /api/health and serves the web app.`);
  } finally {
    child?.kill();
    rmSync(work, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`Smoke test failed: ${error.message}`);
  process.exit(1);
});
