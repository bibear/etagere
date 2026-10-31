import type { Profile } from '@etagere/shared';

import type { ApiClient } from './client';

/** Creates or updates a profile (`PUT /api/profiles/:id`). */
export const putProfile = (
  api: ApiClient,
  id: string,
  input: { name: string; color: string },
): Promise<Profile> => api.put(`/api/profiles/${encodeURIComponent(id)}`, input);
