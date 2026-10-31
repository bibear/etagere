import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// The published package (`npx etagere-server`): manifest invariants and the bundled entry point.

const serverDir = join(__dirname, '..', '..');
const sharedDir = join(serverDir, '..', 'packages', 'shared');
const manifest = JSON.parse(readFileSync(join(serverDir, 'package.json'), 'utf8')) as {
  private?: boolean;
  bin: Record<string, string>;
  files: string[];
  engines: { node: string };
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  scripts: Record<string, string>;
};

/** Runtime source files (tests excluded) of the server and of the bundled shared package. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name.startsWith('._') || name === '__tests__') return [];
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.ts$/.test(name) ? [path] : [];
  });
}

/** Package names imported at runtime (`import type` lines left out). */
function runtimeImports(file: string): string[] {
  const source = readFileSync(file, 'utf8');
  return [...source.matchAll(/^import (?!type )[^;]*?from '([^'.][^']*)'/gm)].map(
    ([, specifier]) => {
      const parts = specifier!.split('/');
      return specifier!.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]!;
    },
  );
}

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      probe.close(() => resolve(typeof address === 'object' && address ? address.port : 0));
    });
  });

describe('the npm package', () => {
  it('is publishable with an etagere-server bin', () => {
    expect(manifest.private).toBeUndefined();
    expect(manifest.bin).toEqual({ 'etagere-server': 'dist/index.js' });
    expect(manifest.files).toEqual(
      expect.arrayContaining(['dist/index.js', 'public', 'LICENSE', 'README.md']),
    );
    expect(manifest.engines.node).toBe('>=24');
    expect(manifest.scripts.prepack).toBe('node scripts/build.js --pwa');
  });

  it('depends on no workspace package (they are bundled)', () => {
    expect(Object.keys(manifest.dependencies)).not.toContain('@etagere/shared');
    expect(manifest.devDependencies['@etagere/shared']).toBeDefined();
  });

  it('declares every package the bundle imports at runtime', () => {
    const builtins = new Set(builtinModules);
    const imported = new Set(
      [...sourceFiles(join(serverDir, 'src')), ...sourceFiles(join(sharedDir, 'src'))].flatMap(
        runtimeImports,
      ),
    );
    const missing = [...imported].filter(
      (name) =>
        !name.startsWith('node:') &&
        !builtins.has(name) &&
        name !== '@etagere/shared' &&
        !(name in manifest.dependencies),
    );

    expect(missing).toEqual([]);
  });

  it('builds a bundle that starts and answers /api/health', async () => {
    const outDir = mkdtempSync(join(serverDir, 'dist-test-'));
    const dataDir = mkdtempSync(join(tmpdir(), 'etagere-package-'));
    const outfile = join(outDir, 'index.js');
    try {
      execFileSync(process.execPath, [
        join(serverDir, 'scripts', 'build.js'),
        '--outfile',
        outfile,
      ]);
      expect(readFileSync(outfile, 'utf8').startsWith('#!/usr/bin/env node\n')).toBe(true);

      const port = await freePort();
      const child = spawn(process.execPath, [outfile], {
        env: {
          ...process.env,
          PORT: String(port),
          HOST: '127.0.0.1',
          ETAGERE_DATA_DIR: dataDir,
          ETAGERE_MDNS: '0',
          LOG_LEVEL: 'warn',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      try {
        const output = await new Promise<string>((resolve, reject) => {
          let text = '';
          const timer = setTimeout(() => reject(new Error(`No start banner: ${text}`)), 20_000);
          const collect = (chunk: Buffer) => {
            text += chunk.toString();
            if (text.includes('Étagère is ready')) {
              clearTimeout(timer);
              resolve(text);
            }
          };
          child.stdout.on('data', collect);
          child.stderr.on('data', collect);
          child.once('exit', (code) => reject(new Error(`Exited with ${code}: ${text}`)));
        });
        expect(output).toContain(`http://localhost:${port}`);

        const response = await fetch(`http://127.0.0.1:${port}/api/health`);
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ status: 'ok', name: 'Étagère' });
      } finally {
        child.kill();
      }
    } finally {
      rmSync(outDir, { recursive: true, force: true });
      rmSync(dataDir, { recursive: true, force: true });
    }
  }, 40_000);
});
