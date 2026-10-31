import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { ERROR_CODES } from '@etagere/shared';

// The app translates the codes of `ERROR_CODES`: a code the server throws but the shared list
// forgets would reach the user as a generic "something went wrong".
const sources = (dir: string): string[] =>
  readdirSync(dir)
    .filter((name) => !name.startsWith('._') && name !== '__tests__')
    .flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return sources(path);
      return name.endsWith('.ts') ? [path] : [];
    });

describe('error codes', () => {
  it('every HttpError code thrown by the server is a shared ERROR_CODES entry', () => {
    const thrown = new Set<string>();
    for (const file of sources(join(__dirname, '..'))) {
      for (const match of readFileSync(file, 'utf8').matchAll(
        /HttpError\(\s*\d+,\s*'([a-z_]+)'/g,
      )) {
        thrown.add(match[1] as string);
      }
    }
    expect(thrown.size).toBeGreaterThan(5);
    expect(
      [...thrown].filter((code) => !(ERROR_CODES as readonly string[]).includes(code)),
    ).toEqual([]);
  });
});
