import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';

import { CoverStore } from './covers';
import type { Database } from './db/database';
import { installErrorHandling } from './http/errors';
import { isLocalAddress, isLocalOrigin } from './lan-only';
import { hasPwa, pwaFallback, pwaStaticOptions } from './pwa/serve';
import { EventBus } from './realtime/events';
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
  /** The exported web app served at `/` (null or a directory without index.html: API only). */
  publicDir?: string | null;
  /** false (default, tests), true (pino to stdout), or a logger instance. */
  logger?: boolean | FastifyBaseLogger;
  logLevel?: string;
}

declare module 'fastify' {
  interface FastifyInstance {
    deps: AppDeps;
    /** Realtime events published after mutations (`app.events.publish(...)`). */
    events: EventBus;
    /** Local book covers (`<dataDir>/covers`). */
    covers: CoverStore;
  }
}

// Request logs carry method, URL and status only: no device address, no body.
const serializers = {
  req: (request: { method: string; url: string }) => ({ method: request.method, url: request.url }),
  res: (reply: { statusCode: number }) => ({ statusCode: reply.statusCode }),
};

export function buildApp(options: BuildAppOptions): FastifyInstance {
  const { logger = false, logLevel = 'info', publicDir = null, ...rest } = options;
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
  app.decorate('events', new EventBus());
  app.decorate(
    'covers',
    new CoverStore({ dataDir: deps.dataDir, fetch: deps.fetch, log: app.log }),
  );
  const pwa = hasPwa(publicDir);
  installErrorHandling(app, pwa ? pwaFallback : undefined);

  // Only the home network may talk to the server (D-03).
  app.addHook('onRequest', async (request, reply) => {
    // No address (detached socket): refused too, the guard fails closed.
    const ip = typeof request.ip === 'string' ? request.ip : '';
    if (!isLocalAddress(ip)) return reply.code(403).send({ code: 'outside_lan' });
  });

  app.register(cors, {
    origin: (origin, callback) => callback(null, origin === undefined || isLocalOrigin(origin)),
  });

  // WebSocket support at the root (realtime events, `app.injectWS` in tests).
  app.register(websocket, { options: { maxPayload: 1024 } });
  app.register(apiRoutes, { prefix: '/api' });
  // The PWA at `/` (docs/ARCHITECTURE.md § PWA), behind the same LAN guard.
  if (pwa) app.register(fastifyStatic, pwaStaticOptions(publicDir));
  return app;
}
