import { readFile, stat } from 'node:fs/promises';

import type { FastifyInstance } from 'fastify';

import { imageTypeOf } from '../covers';
import { HttpError } from '../http/errors';

// GET /api/covers/:file — the local copy of a cover (the app works without Internet).
export async function coverRoutes(app: FastifyInstance): Promise<void> {
  app.get('/covers/:file', async (request, reply) => {
    const { file } = request.params as { file: string };
    const path = app.covers.pathOf(file);
    if (path === null) throw new HttpError(404, 'not_found');
    let info;
    try {
      info = await stat(path);
    } catch {
      throw new HttpError(404, 'not_found');
    }
    // A cover can be replaced (PATCH): browsers revalidate, unchanged files answer 304.
    const etag = `"${info.size.toString(16)}-${Math.trunc(info.mtimeMs).toString(16)}"`;
    reply.header('cache-control', 'no-cache').header('etag', etag);
    if (request.headers['if-none-match'] === etag) return reply.code(304).send();
    const bytes = await readFile(path);
    return reply.type(imageTypeOf(bytes) ?? 'application/octet-stream').send(bytes);
  });
}
