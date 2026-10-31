import type { ServerEvent } from '@etagere/shared';
import type { QueryClient, QueryKey } from '@tanstack/react-query';

import { queryKeys } from '../api/queryKeys';

const SERVER_INFO: QueryKey = ['server-info'];

/** The query key prefixes a server event makes stale (see `api/queryKeys.ts`). */
export function staleKeysFor(event: ServerEvent): QueryKey[] {
  switch (event.type) {
    case 'books.changed':
      // Lists, details, my readings, recommendations, the book count.
      return [queryKeys.books, queryKeys.me, SERVER_INFO];
    case 'comments.changed':
      // `id` is the book: its comments, its comment count, my readings' counts.
      return event.id
        ? [queryKeys.bookComments(event.id), queryKeys.book(event.id), queryKeys.me]
        : [queryKeys.comments, queryKeys.books, queryKeys.me];
    case 'profiles.changed':
      // Names and colors appear in books (reader, readers, added by) and comments.
      return [queryKeys.profiles, queryKeys.books, queryKeys.comments, queryKeys.me, SERVER_INFO];
    default:
      return [];
  }
}

/** Refreshes the queries an event made stale (active ones refetch, others on next use). */
export async function invalidateForEvent(client: QueryClient, event: ServerEvent): Promise<void> {
  await Promise.all(staleKeysFor(event).map((queryKey) => client.invalidateQueries({ queryKey })));
}
