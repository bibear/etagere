import type { BookDetail, BookFilter, BookSort, BooksResponse } from '@etagere/shared';
import { type QueryClient, useQuery } from '@tanstack/react-query';

import { useApi } from '../session/SessionProvider';
import type { ApiClient } from './client';
import { queryKeys } from './queryKeys';

export interface BookListParams {
  query: string;
  filter: BookFilter;
  sort: BookSort;
}

export function listBooks(api: ApiClient, { query, filter, sort }: BookListParams) {
  const search = new URLSearchParams();
  if (query.trim() !== '') search.set('query', query.trim());
  search.set('filter', filter);
  search.set('sort', sort);
  return api.get<BooksResponse>(`/api/books?${search.toString()}`);
}

export const getBook = (api: ApiClient, id: string) =>
  api.get<BookDetail>(`/api/books/${encodeURIComponent(id)}`);

export type ReadingAction = 'start' | 'finish' | 'putdown' | 'already-read';

/** `POST /api/books/:id/reading/<action>`: the updated book. */
export const readingAction = (api: ApiClient, id: string, action: ReadingAction) =>
  api.post<BookDetail>(`/api/books/${encodeURIComponent(id)}/reading/${action}`);

/**
 * `POST /api/books/:id/enrich`: fills only the details the book lacks from Open Library and
 * Google Books (`409 no_isbn`, `502 upstream_unavailable`).
 */
export const enrichBook = (api: ApiClient, id: string) =>
  api.post<BookDetail>(`/api/books/${encodeURIComponent(id)}/enrich`);

export function useBooks(params: BookListParams) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.bookList(params),
    queryFn: () => listBooks(api, params),
    placeholderData: (previous) => previous,
  });
}

export function useBook(id: string) {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.book(id), queryFn: () => getBook(api, id) });
}

/** Stores a fresh `BookDetail` and refreshes the lists and "my" views that depend on it. */
export function bookChanged(queryClient: QueryClient, book: BookDetail): Promise<void> {
  queryClient.setQueryData(queryKeys.book(book.id), book);
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: [...queryKeys.books, 'list'] }),
    queryClient.invalidateQueries({ queryKey: queryKeys.me }),
  ]).then(() => undefined);
}
