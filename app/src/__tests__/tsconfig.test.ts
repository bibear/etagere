import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// `expo start` rewrites app/tsconfig.json when its `include` differs from what Expo expects,
// which leaves a dirty tree and a Prettier failure in `npm run check` (issue #32).
describe('app/tsconfig.json', () => {
  it('includes exactly what the Expo dev server writes, so it never rewrites the file', () => {
    const config = JSON.parse(readFileSync(join(__dirname, '..', '..', 'tsconfig.json'), 'utf8'));
    expect(config.include).toEqual(['**/*.ts', '**/*.tsx']);
  });
});
