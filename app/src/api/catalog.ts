import type { BookCandidate, BookDetail, BookInput } from '@etagere/shared';

import type { ApiClient } from './client';

// Book writes and ISBN lookup (docs/ARCHITECTURE.md, "Books"). Errors surface as `ApiError`.

/** `GET /api/lookup/:isbn`: the Open Library candidate (404 not_found, 409 already_in_library…). */
export const lookupIsbn = (api: ApiClient, isbn: string): Promise<BookCandidate> =>
  api.get(`/api/lookup/${encodeURIComponent(isbn)}`);

/** `POST /api/books`; a duplicate ISBN fails with 409 already_in_library (body.book). */
export const createBook = (api: ApiClient, input: BookInput): Promise<BookDetail> =>
  api.post('/api/books', input);

export const updateBook = (
  api: ApiClient,
  id: string,
  patch: Partial<BookInput>,
): Promise<BookDetail> => api.patch(`/api/books/${encodeURIComponent(id)}`, patch);

export const deleteBook = (api: ApiClient, id: string): Promise<void> =>
  api.delete(`/api/books/${encodeURIComponent(id)}`);

/** The `BookInput` of an Open Library candidate (only the contract's fields: the API is strict). */
export const inputFromCandidate = (candidate: BookCandidate): BookInput => ({
  isbn13: candidate.isbn13,
  title: candidate.title,
  authors: candidate.authors,
  genres: candidate.genres ?? [],
  publisher: candidate.publisher ?? null,
  year: candidate.year ?? null,
  pages: candidate.pages ?? null,
  description: candidate.description ?? null,
  coverSourceUrl: candidate.coverSourceUrl,
});
