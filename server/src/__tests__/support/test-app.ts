import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';

import { type BuildAppOptions, buildApp } from '../../app';
import { type Database, openDatabase } from '../../db/database';

export const TEST_NOW = new Date('2026-10-31T10:00:00.000Z');

/** A fetch that fails the test if anything tries to reach the network. */
export const noNetwork: typeof fetch = async (input) => {
  throw new Error(`network access in a test: ${String(input)}`);
};

export interface TestApp {
  app: FastifyInstance;
  db: Database;
  /** Inserts an active profile and returns its id (use it as X-Etagere-Profile). */
  seedProfile: (name?: string, color?: string) => string;
  close: () => Promise<void>;
}

/**
 * Builds the app on an in-memory database with a fixed clock and no network.
 * Override any dependency: `buildTestApp({ fetch: fakeOpenLibrary })`.
 */
export function buildTestApp(overrides: Partial<BuildAppOptions> = {}): TestApp {
  const db = overrides.db ?? openDatabase(':memory:', { now: () => TEST_NOW });
  const app = buildApp({
    db,
    dataDir: '/nonexistent/etagere-test',
    fetch: noNetwork,
    now: () => TEST_NOW,
    ...overrides,
  });
  const seedProfile = (name = 'Bruno', color = '#1F6B4A') => {
    const id = randomUUID();
    const at = TEST_NOW.toISOString();
    db.prepare('INSERT INTO profiles VALUES (?, ?, ?, ?, ?, NULL)').run(id, name, color, at, at);
    return id;
  };
  return {
    app,
    db,
    seedProfile,
    close: async () => {
      await app.close();
      db.close();
    },
  };
}
