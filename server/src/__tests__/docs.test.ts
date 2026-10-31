import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { MANIFESTS, setVersion } from '../../../scripts/set-version';

// The user and maintainer documentation stays true: commands that exist, links that resolve,
// store texts within the store limits.

const root = join(__dirname, '..', '..', '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const scriptsOf = (manifest: string): Record<string, string> =>
  JSON.parse(read(manifest)).scripts ?? {};
const WORKSPACES: Record<string, string> = {
  'etagere-server': 'server/package.json',
  '@etagere/app': 'app/package.json',
  '@etagere/shared': 'packages/shared/package.json',
};
const DOCS = [
  'README.md',
  'CONTRIBUTING.md',
  'server/README.md',
  'docs/RELEASE.md',
  'docs/store/README.md',
  'docs/store/en.md',
  'docs/store/fr.md',
  'docs/store/privacy.md',
];

describe('documentation', () => {
  it.each(DOCS)('%s only mentions npm scripts that exist', (doc) => {
    const missing = [...read(doc).matchAll(/npm run ([\w:-]+)(?: -w ([\w@/-]+))?/g)]
      .filter(([, script, workspace]) => {
        const manifest = workspace ? WORKSPACES[workspace] : 'package.json';
        return !manifest || !(script! in scriptsOf(manifest));
      })
      .map(([command]) => command);

    expect(missing).toEqual([]);
  });

  it.each(DOCS)('%s links to files that exist', (doc) => {
    const broken = [...read(doc).matchAll(/\]\(((?!https?:|#|mailto:)[^)#\s]+)(#[^)]*)?\)/g)]
      .map(([, target]) => target!)
      .filter((target) => !existsSync(join(root, dirname(doc), target)));

    expect(broken).toEqual([]);
  });

  it('uses the EAS profiles, the image and the package that the build files define', () => {
    const release = read('docs/RELEASE.md');
    const profiles = Object.keys(JSON.parse(read('app/eas.json')).build);
    const used = [...release.matchAll(/--profile (\w+)/g)].map(([, profile]) => profile);

    expect(used.length).toBeGreaterThan(0);
    expect(used.filter((profile) => !profiles.includes(profile!))).toEqual([]);
    expect(release).toContain('ghcr.io/bibear/etagere');
    expect(read('docker/docker-compose.yml')).toContain('image: ghcr.io/bibear/etagere:latest');
    expect(release).toContain('npm publish -w etagere-server');
  });
});

describe('store listings', () => {
  /**
   * `## Field (limit)` or `## Field (Store, limit)` sections of a listing:
   * "Field" or "Field (Store)" → [limit, text].
   */
  const sections = (file: string) =>
    new Map(
      [...read(file).matchAll(/^## (.+)\n\n([\s\S]*?)(?=\n## |$)/gm)].map(([, heading, text]) => {
        const limit = /\((?:([^)]*?), )?(\d+)\)$/.exec(heading!);
        const title = limit
          ? heading!.replace(limit[0], limit[1] ? `(${limit[1]})` : '').trim()
          : heading!;
        return [
          title,
          [limit ? Number(limit[2]) : null, text!.trim().replace(/\n/g, ' ')] as const,
        ];
      }),
    );

  it('has the same fields in French and English', () => {
    expect([...sections('docs/store/fr.md').keys()]).toEqual([
      ...sections('docs/store/en.md').keys(),
    ]);
  });

  it.each(['docs/store/en.md', 'docs/store/fr.md'])('%s fits the store limits', (file) => {
    const fields = sections(file);
    expect(fields.size).toBeGreaterThanOrEqual(8);
    const tooLong = [...fields]
      .filter(([, [limit, text]]) => limit !== null && [...text].length > limit)
      .map(([title, [limit, text]]) => `${title}: ${[...text].length}/${limit}`);

    expect(tooLong).toEqual([]);
  });

  it.each(['docs/store/en.md', 'docs/store/fr.md'])(
    '%s lists keywords separated by bare commas',
    (file) => {
      const [, keywords] = sections(file).get('Keywords (App Store)') ?? [null, ''];
      expect(keywords).toMatch(/^[^\s,]+(,[^\s,]+)+$/);
    },
  );
});

describe('release:version', () => {
  it('sets the version in every manifest and in app.json', () => {
    const copy = mkdtempSync(join(tmpdir(), 'etagere-version-'));
    try {
      for (const file of [...MANIFESTS, 'app/app.json']) {
        mkdirSync(dirname(join(copy, file)), { recursive: true });
        cpSync(join(root, file), join(copy, file));
      }

      setVersion(copy, '2.3.4');

      for (const file of MANIFESTS) {
        expect(JSON.parse(readFileSync(join(copy, file), 'utf8')).version).toBe('2.3.4');
      }
      expect(JSON.parse(readFileSync(join(copy, 'app/app.json'), 'utf8')).expo.version).toBe(
        '2.3.4',
      );
    } finally {
      rmSync(copy, { recursive: true, force: true });
    }
  });

  it('refuses a version that is not semver', () => {
    expect(() => setVersion(root, 'v1')).toThrow('Not a release version: v1');
  });
});
