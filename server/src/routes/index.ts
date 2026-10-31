import type { FastifyInstance } from 'fastify';

import { bookRoutes } from './books';
import { coverRoutes } from './covers';
import { lookupRoutes } from './lookup';
import { profileRoutes } from './profiles';
import { serverRoutes } from './server';

// One module per route group, all mounted under /api. Add yours with one line below.
export async function apiRoutes(app: FastifyInstance): Promise<void> {
  await app.register(serverRoutes);
  await app.register(profileRoutes);
  await app.register(bookRoutes);
  await app.register(lookupRoutes);
  await app.register(coverRoutes);
}
