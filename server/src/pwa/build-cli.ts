import { resolve } from 'node:path';

import { buildPwa } from './build';

// `npm run build:web` (root): after `expo export -p web`, completes app/dist and copies it to
// server/public. Usage: tsx server/src/pwa/build-cli.ts <distDir> <outDir>
const [distArg = 'app/dist', outArg = 'server/public'] = process.argv.slice(2);
const distDir = resolve(distArg);
const outDir = resolve(outArg);
try {
  const { precache, version } = buildPwa(distDir, outDir);
  console.log(`PWA ready in ${outDir} (cache ${version}, ${precache.length} shell files)`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
