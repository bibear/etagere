import type { FastifyInstance } from 'fastify';

import { serverRoutes } from './server';

// One module per route group, all mounted under /api. Add yours with one line below.
export async function apiRoutes(app: FastifyInstance): Promise<void> {
  await app.register(serverRoutes);
}
