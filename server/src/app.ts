import cors from '@fastify/cors';
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';

import type { Database } from './db/database';
import { installErrorHandling } from './http/errors';
import { isLocalAddress, isLocalOrigin } from './lan-only';
import { apiRoutes } from './routes';
import { SERVER_VERSION } from './version';

/** Everything the server needs from the outside world, injected (tests use fakes). */
export interface AppDeps {
  db: Database;
  /** Root of the data directory (covers live in `<dataDir>/covers`). */
  dataDir: string;
  /** Outbound HTTP (Open Library). Tests inject a fake; never the real network. */
  fetch: typeof fetch;
  /** Clock. */
  now: () => Date;
  householdName: string;
  version: string;
  /** LAN URLs of the server, for /api/server-info and pairing. */
  lanUrls: () => string[];
}

export interface BuildAppOptions extends Omit<AppDeps, 'version' | 'householdName' | 'lanUrls'> {
  version?: string;
  householdName?: string;
  lanUrls?: () => string[];
  /** false (default, tests), true (pino to stdout), or a logger instance. */
  logger?: boolean | FastifyBaseLogger;
  logLevel?: string;
}

declare module 'fastify' {
  interface FastifyInstance {
    deps: AppDeps;
  }
}

// Request logs carry method, URL and status only: no device address, no body.
const serializers = {
  req: (request: { method: string; url: string }) => ({ method: request.method, url: request.url }),
  res: (reply: { statusCode: number }) => ({ statusCode: reply.statusCode }),
};

export function buildApp(options: BuildAppOptions): FastifyInstance {
  const { logger = false, logLevel = 'info', ...rest } = options;
  const deps: AppDeps = {
    version: SERVER_VERSION,
    householdName: 'Étagère',
    lanUrls: () => [],
    ...rest,
  };
  const app =
    typeof logger === 'object'
      ? Fastify({ loggerInstance: logger })
      : Fastify({ logger: logger && { level: logLevel, serializers } });

  app.decorate('deps', deps);
  installErrorHandling(app);

  // Only the home network may talk to the server (D-03).
  app.addHook('onRequest', async (request, reply) => {
    if (!isLocalAddress(request.ip)) return reply.code(403).send({ code: 'outside_lan' });
  });

  app.register(cors, {
    origin: (origin, callback) => callback(null, origin === undefined || isLocalOrigin(origin)),
  });

  app.register(apiRoutes, { prefix: '/api' });
  return app;
}
