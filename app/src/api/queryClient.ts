import { QueryClient } from '@tanstack/react-query';

import { ApiError } from './client';

/** Shared query defaults: one retry on network errors only, short staleness (realtime refreshes). */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // Kept a day so the offline copy holds every screen visited, not only the current one.
        gcTime: 24 * 60 * 60 * 1000,
        retry: (failureCount, error) =>
          failureCount < 1 && error instanceof ApiError && error.status === 0,
      },
      mutations: { retry: false },
    },
  });
}
