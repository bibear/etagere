// Points git at the versioned hooks in .githooks (run by `npm install` through `prepare`).
// Silently does nothing outside a git checkout (npm tarball, Docker build).
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

if (existsSync('.git')) {
  try {
    execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { stdio: 'ignore' });
  } catch {
    // git not installed: nothing to configure.
  }
}
