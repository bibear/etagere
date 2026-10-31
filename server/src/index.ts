import { join } from 'node:path';

import { buildApp } from './app';
import { loadConfig } from './config';
import { DATABASE_FILE, openDatabase } from './db/database';
import { announce, pairingBanner } from './discovery';
import { lanUrls } from './network';

// Entry point: `npm run server` (dev, tsx watch) or the published `etagere-server` bin.
async function main(): Promise<void> {
  const config = loadConfig();
  // Bound to loopback only (HOST=127.0.0.1): the LAN addresses would not answer.
  const loopbackOnly = ['127.0.0.1', '::1', 'localhost'].includes(config.host);
  const addresses = () => (loopbackOnly ? [] : lanUrls(config.port));
  const db = openDatabase(join(config.dataDir, DATABASE_FILE));
  const app = buildApp({
    db,
    dataDir: config.dataDir,
    fetch: globalThis.fetch,
    now: () => new Date(),
    householdName: config.householdName,
    lanUrls: addresses,
    logger: true,
    logLevel: config.logLevel,
  });

  let withdraw: () => Promise<void> = async () => {};
  const shutdown = async () => {
    await withdraw();
    await app.close();
    db.close();
    process.exit(0);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  await app.listen({ port: config.port, host: config.host });
  app.log.info(`Étagère is ready. Data: ${config.dataDir}`);
  if (config.mdns && !loopbackOnly) {
    withdraw = announce({
      port: config.port,
      version: app.deps.version,
      householdName: config.householdName,
      log: app.log,
    });
  }
  // Plain stdout, not the JSON logger: the QR code must reach the terminal as drawn.
  process.stdout.write(
    `${await pairingBanner(addresses(), config.port, config.mdns && !loopbackOnly)}\n`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
