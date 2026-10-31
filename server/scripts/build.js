// Builds the publishable `etagere-server` package:
// - dist/index.js: the server in one file (server + @etagere/shared bundled, npm dependencies
//   left external), runnable with plain `node` (the `etagere-server` bin);
// - public/: the exported web app (PWA) served at `/` (with --pwa);
// - LICENSE: copied from the repository root (with --pwa, i.e. before packing).
//
// Usage: node scripts/build.js [--pwa] [--outfile <path>]
const { execFileSync } = require('node:child_process');
const { cpSync, existsSync, readFileSync, rmSync } = require('node:fs');
const { join, resolve } = require('node:path');

const serverDir = resolve(__dirname, '..');
const repoDir = resolve(serverDir, '..');
const appDir = join(repoDir, 'app');

function readManifest() {
  return JSON.parse(readFileSync(join(serverDir, 'package.json'), 'utf8'));
}

/** Bundles src/index.ts into one CommonJS file with a node shebang. */
async function buildServer(outfile = join(serverDir, 'dist', 'index.js')) {
  const { build } = require('esbuild');
  await build({
    entryPoints: [join(serverDir, 'src', 'index.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    target: 'node24',
    format: 'cjs',
    // Installed by npm next to the package; @etagere/shared is a dev dependency, so it is bundled.
    external: Object.keys(readManifest().dependencies ?? {}),
    banner: { js: '#!/usr/bin/env node' },
    legalComments: 'none',
    logLevel: 'warning',
    tsconfig: join(serverDir, 'tsconfig.json'),
  });
  return outfile;
}

/**
 * Exports the Expo web app, completes it as a PWA (manifest, icons, service worker: see
 * src/pwa/build.ts) and copies it to public/ (dotfiles and macOS `._*` files left out).
 */
function buildPwa() {
  const windows = process.platform === 'win32';
  execFileSync(windows ? 'npm.cmd' : 'npm', ['run', 'export:web'], {
    cwd: appDir,
    // Progress goes to stderr: `npm pack --json` prints its result on stdout.
    stdio: ['ignore', 2, 2],
    shell: windows,
  });
  const source = join(appDir, 'dist');
  if (!existsSync(join(source, 'index.html'))) throw new Error('The web export has no index.html');
  const target = join(serverDir, 'public');
  execFileSync(
    process.execPath,
    [require.resolve('tsx/cli'), join(serverDir, 'src', 'pwa', 'build-cli.ts'), source, target],
    { stdio: ['ignore', 2, 2] },
  );
}

function copyLicense() {
  cpSync(join(repoDir, 'LICENSE'), join(serverDir, 'LICENSE'));
}

async function main(argv) {
  const at = argv.indexOf('--outfile');
  const outfile = at >= 0 ? resolve(argv[at + 1]) : undefined;
  if (!outfile) rmSync(join(serverDir, 'dist'), { recursive: true, force: true });
  const file = await buildServer(outfile);
  console.error(`Built ${file}`);
  if (argv.includes('--pwa')) {
    buildPwa();
    copyLicense();
    console.error(`Copied the web app to ${join(serverDir, 'public')}`);
  }
}

module.exports = { buildServer, buildPwa };

if (require.main === module) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
