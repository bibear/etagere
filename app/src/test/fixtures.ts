import type { BookDetail, BookSummary, BooksResponse, Comment, ProfileRef } from '@etagere/shared';

import { TEST_PROFILE } from './render';

export const ME: ProfileRef = {
  id: TEST_PROFILE.id,
  name: TEST_PROFILE.name,
  color: TEST_PROFILE.color,
};
export const CAMILLE: ProfileRef = {
  id: '6f1c2a5e-8c1b-4d8e-9a43-2b7d0c1e9f10',
  name: 'Camille',
  color: '#2C4A6B',
};
export const JULES: ProfileRef = {
  id: '0b7e4c1d-2f3a-4b5c-8d9e-1a2b3c4d5e6f',
  name: 'Jules',
  color: '#B5523B',
};

export function bookSummary(overrides: Partial<BookSummary> = {}): BookSummary {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    isbn13: '9782266320481',
    title: 'Dune',
    authors: ['Frank Herbert'],
    coverUrl: null,
    addedAt: '2026-10-01T10:00:00.000Z',
    availability: { state: 'available' },
    readByMe: false,
    ...overrides,
  };
}

export function bookDetail(overrides: Partial<BookDetail> = {}): BookDetail {
  return {
    ...bookSummary(),
    genres: ['Science-fiction'],
    publisher: 'Pocket',
    year: 1965,
    pages: 928,
    description: null,
    source: 'lookup',
    addedBy: CAMILLE,
    readBy: [],
    commentCount: 0,
    ...overrides,
  };
}

export function booksResponse(
  books: BookSummary[],
  counts: Partial<BooksResponse['counts']> = {},
): BooksResponse {
  return {
    books,
    counts: { all: books.length, available: 0, reading: 0, lent: 0, unreadByMe: 0, ...counts },
  };
}

export function comment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 'c0000000-0000-4000-8000-000000000001',
    bookId: bookSummary().id,
    author: CAMILLE,
    text: 'Le début est dense, accrochez-vous.',
    createdAt: '2025-09-12T08:00:00.000Z',
    updatedAt: '2025-09-12T08:00:00.000Z',
    ...overrides,
  };
}
