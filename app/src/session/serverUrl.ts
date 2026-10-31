import { DEFAULT_SERVER_PORT } from './constants';

interface Environment {
  os: string;
  dev: boolean;
  location?: { origin: string; hostname: string; protocol: string };
}

/**
 * Where the server is expected before the user saved an address:
 * - PWA served by the server: its own origin;
 * - web in development (Expo dev server on another port): the same host on port 4848;
 * - native: `http://etagere.local:4848` (mDNS).
 */
export function defaultServerUrl(env: Environment): string {
  if (env.os === 'web' && env.location) {
    if (!env.dev) return env.location.origin;
    return `${env.location.protocol}//${env.location.hostname}:${DEFAULT_SERVER_PORT}`;
  }
  return `http://etagere.local:${DEFAULT_SERVER_PORT}`;
}

/** Normalises a typed server address: adds `http://` and the default port when missing. */
export function normalizeServerUrl(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed === '') return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (!url.hostname) return null;
  const port = url.port || (/^https:/i.test(withScheme) ? '' : String(DEFAULT_SERVER_PORT));
  return `${url.protocol}//${url.hostname.includes(':') ? `[${url.hostname}]` : url.hostname}${port ? `:${port}` : ''}`;
}
