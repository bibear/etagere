import { resolve } from 'node:path';

export interface Config {
  port: number;
  host: string;
  dataDir: string;
  householdName: string;
  logLevel: string;
  /** Announce `_etagere._tcp` / `etagere.local` over mDNS (`ETAGERE_MDNS=0` turns it off). */
  mdns: boolean;
  /** ETAGERE_PUBLIC_DIR: the exported web app to serve; null = the package's `public/`. */
  publicDir: string | null;
  /** ETAGERE_ALLOWED_HOSTS: extra host names (comma separated) besides IPs, localhost, *.local. */
  allowedHosts: string[];
  /** ETAGERE_PUBLIC_URL: the address phones should use (banner, QR code, server-info). */
  publicUrl: string | null;
}

export const DEFAULT_PORT = 4848;

/** `http(s)://host[:port]` without trailing slash, or throws (a typo must not reach the QR code). */
function parsePublicUrl(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  if (trimmed === '') return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error(`Invalid ETAGERE_PUBLIC_URL: ${value}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Invalid ETAGERE_PUBLIC_URL: ${value}`);
  }
  return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, '')}`;
}

/** Reads the configuration from the environment (PORT, HOST, ETAGERE_*). */
export function loadConfig(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()): Config {
  const port = env.PORT === undefined || env.PORT === '' ? DEFAULT_PORT : Number(env.PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`Invalid PORT: ${env.PORT}`);
  }
  const publicUrl = parsePublicUrl(env.ETAGERE_PUBLIC_URL);
  const allowedHosts = (env.ETAGERE_ALLOWED_HOSTS ?? '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter((host) => host !== '');
  // The advertised name must be answered by the Host check (D-52).
  if (publicUrl) allowedHosts.push(new URL(publicUrl).hostname.replace(/^\[|\]$/g, ''));
  return {
    port,
    host: env.HOST || '0.0.0.0',
    dataDir: resolve(cwd, env.ETAGERE_DATA_DIR || 'etagere-data'),
    householdName: env.ETAGERE_HOUSEHOLD_NAME?.trim() || 'Étagère',
    logLevel: env.LOG_LEVEL || 'info',
    mdns: !['0', 'false', 'off', 'no'].includes((env.ETAGERE_MDNS ?? '').trim().toLowerCase()),
    publicDir: env.ETAGERE_PUBLIC_DIR ? resolve(cwd, env.ETAGERE_PUBLIC_DIR) : null,
    allowedHosts,
    publicUrl,
  };
}
