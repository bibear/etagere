// Sets the release version everywhere it lives (maintainer, see docs/RELEASE.md):
// the root, shared, server and app package.json files, app/app.json, then the lock file.
//
// Usage: npm run release:version -- 0.2.0
const { execFileSync } = require('node:child_process');
const { readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const MANIFESTS = [
  'package.json',
  'packages/shared/package.json',
  'server/package.json',
  'app/package.json',
];
const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

const update = (file, change) => {
  const value = JSON.parse(readFileSync(file, 'utf8'));
  change(value);
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
};

/** Writes `version` into every manifest under `rootDir`; returns the files changed. */
function setVersion(rootDir, version) {
  if (!SEMVER.test(version)) throw new Error(`Not a release version: ${version}`);
  for (const manifest of MANIFESTS) {
    update(join(rootDir, manifest), (pkg) => {
      pkg.version = version;
    });
  }
  update(join(rootDir, 'app', 'app.json'), (config) => {
    config.expo.version = version;
  });
  return [...MANIFESTS, 'app/app.json'];
}

module.exports = { setVersion, MANIFESTS };

if (require.main === module) {
  const root = join(__dirname, '..');
  try {
    const files = setVersion(root, process.argv[2] ?? '');
    const windows = process.platform === 'win32';
    execFileSync(windows ? 'npm.cmd' : 'npm', ['install', '--package-lock-only', '--no-audit'], {
      cwd: root,
      stdio: 'inherit',
      shell: windows,
    });
    console.log(`Version ${process.argv[2]} set in ${[...files, 'package-lock.json'].join(', ')}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
