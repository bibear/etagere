// Builds the multi-architecture Docker image and pushes it to ghcr.io (maintainer only).
// Prerequisites: Docker with buildx, `docker login ghcr.io` (see docs/RELEASE.md).
//
// Usage: npm run release:docker [-- --dry-run] [-- --no-latest]
const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const IMAGE = 'ghcr.io/bibear/etagere';
const PLATFORMS = ['linux/amd64', 'linux/arm64'];

/** The commands of a release, in order (pure: tested without Docker). */
function releaseCommands({ version, latest = true, image = IMAGE, platforms = PLATFORMS }) {
  if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`Not a release version: ${version}`);
  }
  const prerelease = version.includes('-');
  const tags = [`${image}:${version}`];
  if (latest && !prerelease) tags.push(`${image}:latest`);
  return [
    ['docker', ['buildx', 'inspect', 'etagere-release']],
    [
      'docker',
      [
        'buildx',
        'build',
        '--builder',
        'etagere-release',
        '--platform',
        platforms.join(','),
        '--file',
        'docker/Dockerfile',
        '--build-arg',
        `VERSION=${version}`,
        ...tags.flatMap((tag) => ['--tag', tag]),
        '--push',
        '.',
      ],
    ],
  ];
}

function main(argv) {
  const root = join(__dirname, '..');
  const { version } = JSON.parse(readFileSync(join(root, 'server', 'package.json'), 'utf8'));
  const commands = releaseCommands({ version, latest: !argv.includes('--no-latest') });
  const dryRun = argv.includes('--dry-run');
  for (const [command, args] of commands) {
    console.log(`$ ${command} ${args.join(' ')}`);
    if (dryRun) continue;
    if (args[1] === 'inspect') {
      // A builder able to cross-build, created once per machine.
      try {
        execFileSync(command, args, { cwd: root, stdio: 'ignore' });
      } catch {
        execFileSync(command, ['buildx', 'create', '--name', 'etagere-release'], {
          cwd: root,
          stdio: 'inherit',
        });
      }
      continue;
    }
    execFileSync(command, args, { cwd: root, stdio: 'inherit' });
  }
}

module.exports = { releaseCommands, IMAGE, PLATFORMS };

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
