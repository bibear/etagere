import { APP_NAME, type HealthResponse, type ServerInfo } from '@etagere/shared';
import type { FastifyInstance } from 'fastify';

import { countBooks } from '../db/books';
import { countActiveProfiles } from '../db/profiles';

// GET /api/health, GET /api/server-info
export async function serverRoutes(app: FastifyInstance): Promise<void> {
  const { deps } = app;

  app.get('/health', async (): Promise<HealthResponse> => ({
    status: 'ok',
    name: APP_NAME,
    version: deps.version,
    householdName: deps.householdName,
  }));

  app.get('/server-info', async (): Promise<ServerInfo> => ({
    version: deps.version,
    bookCount: countBooks(deps.db),
    profileCount: countActiveProfiles(deps.db),
    urls: deps.lanUrls(),
  }));
}
