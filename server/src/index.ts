import { join } from 'node:path';

import { buildApp } from './app';
import { loadConfig } from './config';
import { DATABASE_FILE, openDatabase } from './db/database';
import { lanUrls } from './network';

// Entry point: `npm run server` (dev, tsx watch) or the published `etagere-server` bin.
async function main(): Promise<void> {
  const config = loadConfig();
  const db = openDatabase(join(config.dataDir, DATABASE_FILE));
  const app = buildApp({
    db,
    dataDir: config.dataDir,
    fetch: globalThis.fetch,
    now: () => new Date(),
    householdName: config.householdName,
    lanUrls: () => lanUrls(config.port),
    logger: true,
    logLevel: config.logLevel,
  });

  const shutdown = async () => {
    await app.close();
    db.close();
    process.exit(0);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  await app.listen({ port: config.port, host: config.host });
  const urls = lanUrls(config.port);
  app.log.info(`Étagère is ready. Data: ${config.dataDir}`);
  for (const url of urls.length > 0 ? urls : [`http://localhost:${config.port}`]) {
    app.log.info(`Open ${url} on a phone of the household`);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
