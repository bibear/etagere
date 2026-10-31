import { resolve } from 'node:path';

export interface Config {
  port: number;
  host: string;
  dataDir: string;
  householdName: string;
  logLevel: string;
}

export const DEFAULT_PORT = 4848;

/** Reads the configuration from the environment (PORT, HOST, ETAGERE_*). */
export function loadConfig(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()): Config {
  const port = env.PORT === undefined || env.PORT === '' ? DEFAULT_PORT : Number(env.PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`Invalid PORT: ${env.PORT}`);
  }
  return {
    port,
    host: env.HOST || '0.0.0.0',
    dataDir: resolve(cwd, env.ETAGERE_DATA_DIR || 'etagere-data'),
    householdName: env.ETAGERE_HOUSEHOLD_NAME?.trim() || 'Étagère',
    logLevel: env.LOG_LEVEL || 'info',
  };
}
