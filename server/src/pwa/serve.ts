import { existsSync } from 'node:fs';
import { join } from 'node:path';

import type { FastifyStaticOptions } from '@fastify/static';
import type { FastifyReply, FastifyRequest } from 'fastify';

// Serves the exported web app (the PWA) at `/` (docs/ARCHITECTURE.md § PWA).

/** Hashed bundles never change under the same name; everything else is revalidated. */
const IMMUTABLE = /^\/_expo\/static\//;

/** True when `publicDir` holds an exported web app. */
export const hasPwa = (publicDir: string | null | undefined): publicDir is string =>
  typeof publicDir === 'string' && existsSync(join(publicDir, 'index.html'));

/**
 * SPA fallback for the not-found handler: a GET/HEAD of a page path (not `/api`, no file
 * extension) answers `index.html` so deep links such as `/book/<id>` open the app.
 * Returns false when the request is not a page (the caller answers `404 not_found`).
 */
export function pwaFallback(request: FastifyRequest, reply: FastifyReply): boolean {
  if (request.method !== 'GET' && request.method !== 'HEAD') return false;
  const path = request.url.split('?')[0] ?? '';
  if (path === '/api' || path.startsWith('/api/')) return false;
  const last = path.slice(path.lastIndexOf('/') + 1);
  if (last.includes('.')) return false;
  void reply.sendFile('index.html');
  return true;
}

/**
 * Options of `@fastify/static` for the PWA. Registered at the root (the plugin is not
 * encapsulated) so the not-found handler can `sendFile('index.html')`.
 */
export function pwaStaticOptions(publicDir: string): FastifyStaticOptions {
  return {
    root: publicDir,
    prefix: '/',
    index: ['index.html'],
    // Dotfiles (and AppleDouble `._*` files) are never served.
    dotfiles: 'ignore',
    allowedPath: (pathName) => !pathName.split('/').some((part) => part.startsWith('._')),
    cacheControl: false,
    setHeaders: (reply) => {
      const path = reply.request.url.split('?')[0] ?? '';
      void reply.header(
        'cache-control',
        IMMUTABLE.test(path) ? 'public, max-age=31536000, immutable' : 'no-cache',
      );
    },
  };
}
