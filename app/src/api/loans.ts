import type { BookDetail } from '@etagere/shared';

import type { ApiClient } from './client';

// Loans to people outside the household (docs/ARCHITECTURE.md, "Loans").

/** `POST /api/books/:id/loan`: lends the book; `409 unavailable` when it is being read or lent. */
export const lendBook = (api: ApiClient, id: string, borrower: string): Promise<BookDetail> =>
  api.post(`/api/books/${encodeURIComponent(id)}/loan`, { borrower });

/** `POST /api/books/:id/loan/return`: the book is back on the shelf. */
export const returnBook = (api: ApiClient, id: string): Promise<BookDetail> =>
  api.post(`/api/books/${encodeURIComponent(id)}/loan/return`);
