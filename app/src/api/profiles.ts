import type { Profile } from '@etagere/shared';

import type { ApiClient } from './client';

/** Creates or updates a profile (`PUT /api/profiles/:id`). */
export const putProfile = (
  api: ApiClient,
  id: string,
  input: { name: string; color: string },
): Promise<Profile> => api.put(`/api/profiles/${encodeURIComponent(id)}`, input);

/** The household members (`GET /api/profiles`, removed ones excluded). */
export const listProfiles = (api: ApiClient): Promise<Profile[]> =>
  api.get<{ profiles: Profile[] }>('/api/profiles').then((response) => response.profiles);

/** Removes a member (`DELETE /api/profiles/:id`, soft delete: their history stays). */
export const removeProfile = (api: ApiClient, id: string): Promise<void> =>
  api.delete(`/api/profiles/${encodeURIComponent(id)}`);
