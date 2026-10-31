import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { IMAGE, releaseCommands } from '../../../scripts/release-docker';

// The Docker image cannot be built in the test run (no Docker on every machine): these tests pin
// the contract of the Dockerfile, the compose file and the release commands.

const root = join(__dirname, '..', '..', '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('Dockerfile', () => {
  const dockerfile = read('docker/Dockerfile');
  const stages = dockerfile.split(/^FROM /m).slice(1);

  it('builds on node:24-alpine in two stages', () => {
    expect(stages.map((stage) => stage.split('\n')[0])).toEqual([
      'node:24-alpine AS build',
      'node:24-alpine',
    ]);
  });

  it('installs the packed npm package, so the image runs what npm users run', () => {
    expect(stages[0]).toContain('npm ci');
    expect(stages[0]).toMatch(/npm pack -w etagere-server --pack-destination \/out/);
    expect(stages[1]).toMatch(/npm install --omit=dev .*etagere-server-\*\.tgz/);
    expect(stages[1]).toContain(
      'CMD ["node", "/opt/etagere/node_modules/etagere-server/dist/index.js"]',
    );
  });

  it('keeps the data in the /data volume and listens on 4848', () => {
    expect(stages[1]).toMatch(/ETAGERE_DATA_DIR=\/data/);
    expect(stages[1]).toMatch(/PORT=4848/);
    expect(stages[1]).toContain('VOLUME ["/data"]');
    expect(stages[1]).toContain('EXPOSE 4848');
  });

  it('runs unprivileged with a health check on /api/health', () => {
    expect(stages[1]).toMatch(/chown node:node \/data/);
    expect(stages[1]).toMatch(/^USER node$/m);
    expect(stages[1]).toMatch(/HEALTHCHECK .*\n.*\/api\/health/);
  });

  it('links the image to the repository and its license', () => {
    expect(dockerfile).toContain(
      'org.opencontainers.image.source="https://github.com/bibear/etagere"',
    );
    expect(dockerfile).toContain('org.opencontainers.image.licenses="AGPL-3.0-only"');
  });

  it('keeps local artefacts out of the build context', () => {
    const ignored = read('.dockerignore').split('\n');
    expect(ignored).toEqual(
      expect.arrayContaining(['**/node_modules', '**/._*', '.git', 'server/public', 'app/dist']),
    );
  });
});

describe('docker-compose.yml', () => {
  const compose = read('docker/docker-compose.yml');

  it('runs the published image with a persistent volume on port 4848', () => {
    expect(compose).toContain(`image: ${IMAGE}:latest`);
    expect(compose).toContain('restart: unless-stopped');
    expect(compose).toMatch(/- etagere-data:\/data/);
    expect(compose).toMatch(/- '4848:4848'/);
    expect(compose).toMatch(/^volumes:\n {2}etagere-data:/m);
  });

  it('documents host networking for mDNS', () => {
    expect(compose).toContain('# network_mode: host');
  });
});

describe('release:docker', () => {
  const build = (commands: Array<[string, string[]]>) => commands[1]![1];

  it('pushes a multi-architecture image tagged with the version and latest', () => {
    const args = build(releaseCommands({ version: '1.2.0' }));

    expect(args.slice(0, 2)).toEqual(['buildx', 'build']);
    expect(args.join(' ')).toContain('--platform linux/amd64,linux/arm64');
    expect(args.join(' ')).toContain('--file docker/Dockerfile');
    expect(args.join(' ')).toContain('--build-arg VERSION=1.2.0');
    expect(args.join(' ')).toContain(
      '--tag ghcr.io/bibear/etagere:1.2.0 --tag ghcr.io/bibear/etagere:latest',
    );
    expect(args.slice(-2)).toEqual(['--push', '.']);
  });

  it('does not move latest for a pre-release or on request', () => {
    expect(build(releaseCommands({ version: '1.3.0-beta.1' }))).not.toContain(
      'ghcr.io/bibear/etagere:latest',
    );
    expect(build(releaseCommands({ version: '1.3.0', latest: false }))).not.toContain(
      'ghcr.io/bibear/etagere:latest',
    );
  });

  it('refuses a version that is not semver', () => {
    expect(() => releaseCommands({ version: 'dev' })).toThrow('Not a release version: dev');
  });
});
