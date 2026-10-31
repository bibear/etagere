import { type BookCandidate, normalizeIsbn } from '@etagere/shared';
import type { FastifyInstance } from 'fastify';

import { lookupBook } from '../book-lookup';
import { findBookIdByIsbn } from '../db/books';
import { HttpError } from '../http/errors';
import { profileIdOf } from '../http/profile';
import { alreadyInLibrary } from './books';

// GET /api/lookup/:isbn
export async function lookupRoutes(app: FastifyInstance): Promise<void> {
  const { deps } = app;

  app.get('/lookup/:isbn', async (request): Promise<BookCandidate> => {
    const { isbn } = request.params as { isbn: string };
    const isbn13 = normalizeIsbn(isbn);
    if (isbn13 === null) throw new HttpError(400, 'invalid_isbn');
    const existing = findBookIdByIsbn(deps.db, isbn13);
    if (existing) throw alreadyInLibrary(deps.db, existing, profileIdOf(request) ?? null);

    const result = await lookupBook(isbn13, { fetch: deps.fetch });
    if (result.kind === 'not_found') throw new HttpError(404, 'not_found');
    if (result.kind === 'unavailable') throw new HttpError(502, 'upstream_unavailable');
    return result.candidate;
  });
}
