import type { BookFilter, BookSort } from '@etagere/shared';

/**
 * TanStack Query keys of the app. Invalidating a prefix (`queryKeys.books`) refreshes every
 * query below it, which is what realtime events and mutations do.
 */
export const queryKeys = {
  serverInfo: (serverUrl: string) => ['server-info', serverUrl] as const,
  profiles: ['profiles'] as const,
  books: ['books'] as const,
  bookList: (params: { query: string; filter: BookFilter; sort: BookSort }) =>
    ['books', 'list', params] as const,
  book: (id: string) => ['books', 'detail', id] as const,
  comments: ['comments'] as const,
  bookComments: (bookId: string) => ['comments', bookId] as const,
  me: ['me'] as const,
};
