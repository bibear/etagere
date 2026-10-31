import type { FastifyInstance } from 'fastify';

import { bookRoutes } from './books';
import { commentRoutes } from './comments';
import { coverRoutes } from './covers';
import { eventRoutes } from './events';
import { loanRoutes } from './loans';
import { lookupRoutes } from './lookup';
import { profileRoutes } from './profiles';
import { readingRoutes } from './readings';
import { serverRoutes } from './server';

// One module per route group, all mounted under /api. Add yours with one line below.
export async function apiRoutes(app: FastifyInstance): Promise<void> {
  await app.register(serverRoutes);
  await app.register(profileRoutes);
  await app.register(bookRoutes);
  await app.register(lookupRoutes);
  await app.register(coverRoutes);
  await app.register(readingRoutes);
  await app.register(loanRoutes);
  await app.register(commentRoutes);
  await app.register(eventRoutes);
}
