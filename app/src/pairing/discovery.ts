import { normalizeServerUrl } from '../session/serverUrl';

/**
 * Tries each candidate address in order (saved address, then `etagere.local`) and returns the
 * first one whose probe answers. Rejects with the last failure when none does.
 */
export async function discoverServer<T>(
  candidates: readonly string[],
  probe: (url: string) => Promise<T>,
): Promise<{ url: string; result: T }> {
  let lastError: unknown = new Error('No server address to try');
  for (const url of [...new Set(candidates)]) {
    try {
      return { url, result: await probe(url) };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

/**
 * The server address carried by a scanned QR code (the server prints `http://<ip>:4848`), or
 * null when the code is something else.
 */
export function serverUrlFromCode(data: string): string | null {
  const trimmed = data.trim();
  if (!/^https?:\/\/[^\s]+$/i.test(trimmed)) return null;
  return normalizeServerUrl(trimmed);
}
