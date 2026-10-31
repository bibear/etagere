import { randomUUID } from 'node:crypto';

import {
  type BookCounts,
  type BookDetail,
  type BookSummary,
  type BooksQueryParsed,
  type BooksResponse,
  bookInputSchema,
  bookPatchSchema,
  booksQuerySchema,
  uuidSchema,
} from '@etagere/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import {
  deleteBook,
  findBookIdByIsbn,
  findBookRow,
  findDetail,
  findSummary,
  insertBook,
  isUniqueViolation,
  searchSummaries,
  updateBook,
} from '../db/books';
import type { Database } from '../db/database';
import { HttpError } from '../http/errors';
import { profileIdOf, requireProfile } from '../http/profile';
import { parseInput } from '../http/validation';

const idParams = z.object({ id: uuidSchema });
const collator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });

const countsOf = (books: BookSummary[]): BookCounts => ({
  all: books.length,
  available: books.filter((book) => book.availability.state === 'available').length,
  reading: books.filter((book) => book.availability.state === 'reading').length,
  lent: books.filter((book) => book.availability.state === 'lent').length,
  unreadByMe: books.filter((book) => !book.readByMe).length,
});

const matchesFilter = (book: BookSummary, filter: BooksQueryParsed['filter']): boolean => {
  switch (filter) {
    case 'all':
      return true;
    case 'unread_by_me':
      return !book.readByMe;
    default:
      return book.availability.state === filter;
  }
};

const byTitle = (a: BookSummary, b: BookSummary) => collator.compare(a.title, b.title);
const SORTS: Record<BooksQueryParsed['sort'], (a: BookSummary, b: BookSummary) => number> = {
  // Newest first; same instant: by title.
  added: (a, b) => b.addedAt.localeCompare(a.addedAt) || byTitle(a, b),
  title: byTitle,
  author: (a, b) => collator.compare(a.authors[0] ?? '', b.authors[0] ?? '') || byTitle(a, b),
};

/** `409 already_in_library` with the existing book. */
export function alreadyInLibrary(db: Database, bookId: string, meId: string | null): HttpError {
  return new HttpError(409, 'already_in_library', { book: findSummary(db, bookId, meId) });
}

// GET/POST /api/books, GET/PATCH/DELETE /api/books/:id
export async function bookRoutes(app: FastifyInstance): Promise<void> {
  const { deps } = app;
  const { db } = deps;

  const detailOr404 = (id: string, meId: string | null): BookDetail => {
    const detail = findDetail(db, id, meId);
    if (!detail) throw new HttpError(404, 'not_found');
    return detail;
  };

  app.get('/books', async (request): Promise<BooksResponse> => {
    const { query, filter, sort } = parseInput(booksQuerySchema, request.query);
    const matching = searchSummaries(db, query, profileIdOf(request) ?? null);
    return {
      books: matching.filter((book) => matchesFilter(book, filter)).sort(SORTS[sort]),
      counts: countsOf(matching),
    };
  });

  app.get('/books/:id', async (request): Promise<BookDetail> => {
    const { id } = parseInput(idParams, request.params);
    return detailOr404(id, profileIdOf(request) ?? null);
  });

  app.post('/books', async (request, reply) => {
    const me = requireProfile(request);
    const input = parseInput(bookInputSchema, request.body);
    const existing = input.isbn13 ? findBookIdByIsbn(db, input.isbn13) : undefined;
    if (existing) throw alreadyInLibrary(db, existing, me.id);

    const id = randomUUID();
    const cover = await app.covers.download(id, input.coverSourceUrl ?? null);
    try {
      insertBook(db, {
        id,
        input,
        // A book with an ISBN comes from a scan or a typed ISBN (lookup); without: the form.
        source: input.isbn13 ? 'lookup' : 'manual',
        cover,
        addedBy: me.id,
        at: deps.now().toISOString(),
      });
    } catch (error) {
      await app.covers.remove(cover);
      const duplicate = input.isbn13 ? findBookIdByIsbn(db, input.isbn13) : undefined;
      if (duplicate && isUniqueViolation(error)) throw alreadyInLibrary(db, duplicate, me.id);
      throw error;
    }
    app.events.publish({ type: 'books.changed', id });
    return reply.code(201).send(detailOr404(id, me.id));
  });

  app.patch('/books/:id', async (request): Promise<BookDetail> => {
    const me = requireProfile(request);
    const { id } = parseInput(idParams, request.params);
    const patch = parseInput(bookPatchSchema, request.body);
    const row = findBookRow(db, id);
    if (!row) throw new HttpError(404, 'not_found');
    if (patch.isbn13) {
      const other = findBookIdByIsbn(db, patch.isbn13);
      if (other && other !== id) throw alreadyInLibrary(db, other, me.id);
    }

    // coverSourceUrl: a new URL replaces the cover, null removes it, absent keeps it.
    let cover: string | null | undefined;
    if (patch.coverSourceUrl !== undefined) {
      cover = await app.covers.download(id, patch.coverSourceUrl);
      if (cover === null && patch.coverSourceUrl !== null) cover = undefined; // download failed
    }
    try {
      updateBook(db, id, patch, deps.now().toISOString(), cover);
    } catch (error) {
      const other = patch.isbn13 ? findBookIdByIsbn(db, patch.isbn13) : undefined;
      if (other && isUniqueViolation(error)) throw alreadyInLibrary(db, other, me.id);
      throw error;
    }
    if (cover === null && row.cover !== null) await app.covers.remove(row.cover);
    app.events.publish({ type: 'books.changed', id });
    return detailOr404(id, me.id);
  });

  app.delete('/books/:id', async (request, reply) => {
    requireProfile(request);
    const { id } = parseInput(idParams, request.params);
    const row = findBookRow(db, id);
    if (!row) throw new HttpError(404, 'not_found');
    deleteBook(db, id);
    await app.covers.remove(row.cover);
    app.events.publish({ type: 'books.changed', id });
    return reply.code(204).send();
  });
}
