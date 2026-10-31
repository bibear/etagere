import { PROFILE_HEADER } from '@etagere/shared';
import type { FastifyRequest } from 'fastify';

import { type ProfileRow, findActiveProfile } from '../db/profiles';
import { HttpError } from './errors';

/** The profile id sent in `X-Etagere-Profile`, or undefined. */
export function profileIdOf(request: FastifyRequest): string | undefined {
  const value = request.headers[PROFILE_HEADER];
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/** The current (known, not removed) profile; otherwise `401 { code: "unknown_profile" }`. */
export function requireProfile(request: FastifyRequest): ProfileRow {
  const id = profileIdOf(request);
  const profile = id === undefined ? undefined : findActiveProfile(request.server.deps.db, id);
  if (!profile) throw new HttpError(401, 'unknown_profile');
  return profile;
}
