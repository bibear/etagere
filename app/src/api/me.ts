import type { MyReadingsResponse, RecommendationsResponse } from '@etagere/shared';
import { useQuery } from '@tanstack/react-query';

import { useApi } from '../session/SessionProvider';
import type { ApiClient } from './client';
import { queryKeys } from './queryKeys';

// The header profile's own views (docs/ARCHITECTURE.md, "Readings" and "Recommendations").

/** `GET /api/me/readings`: current reading, finished books (most recent first), stats. */
export const getMyReadings = (api: ApiClient): Promise<MyReadingsResponse> =>
  api.get('/api/me/readings');

/** `GET /api/me/recommendations`: featured book, other books on the shelf, ideas to buy. */
export const getRecommendations = (api: ApiClient): Promise<RecommendationsResponse> =>
  api.get('/api/me/recommendations');

export function useMyReadings() {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.myReadings, queryFn: () => getMyReadings(api) });
}

export function useRecommendations() {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.myRecommendations,
    queryFn: () => getRecommendations(api),
  });
}
