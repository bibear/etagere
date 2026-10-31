import { type Profile, profileInputSchema, uuidSchema } from '@etagere/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { transaction } from '../db/database';
import {
  findActiveProfile,
  findProfile,
  listActiveProfiles,
  removeProfile,
  toProfile,
  upsertProfile,
} from '../db/profiles';
import { putDownReadingsOf } from '../db/readings';
import { HttpError } from '../http/errors';
import { profileIdOf, requireProfile } from '../http/profile';
import { parseInput } from '../http/validation';

const idParams = z.object({ id: uuidSchema });

// GET /api/profiles, PUT /api/profiles/:id, DELETE /api/profiles/:id
export async function profileRoutes(app: FastifyInstance): Promise<void> {
  const { deps } = app;

  app.get('/profiles', async (): Promise<{ profiles: Profile[] }> => ({
    profiles: listActiveProfiles(deps.db).map(toProfile),
  }));

  app.put('/profiles/:id', async (request): Promise<Profile> => {
    const { id } = parseInput(idParams, request.params);
    const input = parseInput(profileInputSchema, request.body);
    const caller = profileIdOf(request);
    // A device edits its own profile; creation may come without a header (first launch).
    if (caller !== undefined && caller !== id) throw new HttpError(403, 'profile_mismatch');
    if (caller === undefined && findProfile(deps.db, id)) {
      throw new HttpError(401, 'unknown_profile');
    }
    const row = upsertProfile(deps.db, { id, ...input }, deps.now().toISOString());
    app.events.publish({ type: 'profiles.changed', id });
    return toProfile(row);
  });

  app.delete('/profiles/:id', async (request, reply) => {
    requireProfile(request);
    const { id } = parseInput(idParams, request.params);
    if (!findActiveProfile(deps.db, id)) throw new HttpError(404, 'not_found');
    const at = deps.now().toISOString();
    const freed = transaction(deps.db, () => {
      removeProfile(deps.db, id, at);
      // A removed member cannot hold a book: their current reading is put down.
      return putDownReadingsOf(deps.db, id);
    });
    app.events.publish({ type: 'profiles.changed', id });
    for (const bookId of freed) app.events.publish({ type: 'books.changed', id: bookId });
    return reply.code(204).send();
  });
}
