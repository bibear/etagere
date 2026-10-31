import type { Comment } from '@etagere/shared';
import { useQuery } from '@tanstack/react-query';

import { useApi } from '../session/SessionProvider';
import type { ApiClient } from './client';
import { queryKeys } from './queryKeys';

export const listComments = (api: ApiClient, bookId: string) =>
  api
    .get<{ comments: Comment[] }>(`/api/books/${encodeURIComponent(bookId)}/comments`)
    .then((response) => response.comments);

export const postComment = (api: ApiClient, bookId: string, text: string) =>
  api.post<Comment>(`/api/books/${encodeURIComponent(bookId)}/comments`, { text });

export const editComment = (api: ApiClient, id: string, text: string) =>
  api.patch<Comment>(`/api/comments/${encodeURIComponent(id)}`, { text });

export const deleteComment = (api: ApiClient, id: string) =>
  api.delete(`/api/comments/${encodeURIComponent(id)}`);

export function useComments(bookId: string) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.bookComments(bookId),
    queryFn: () => listComments(api, bookId),
  });
}
