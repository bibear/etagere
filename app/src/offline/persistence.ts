import { type DehydratedState, type QueryClient, dehydrate, hydrate } from '@tanstack/react-query';

import type { KeyValueStorage } from '../session/SessionProvider';

// Offline copy of the query cache (docs/ARCHITECTURE.md, "Offline"): the last successful results
// are saved on the device and restored at start, so the app can show them without the server.

export const QUERY_CACHE_KEY = 'etagere.queryCache';
const VERSION = 1;
/** A copy older than this is not shown any more. */
export const MAX_CACHE_AGE_MS = 30 * 24 * 60 * 60 * 1000;

interface Snapshot {
  version: number;
  /** Server and profile the data belongs to (see `cacheOwner`). */
  owner: string;
  savedAt: number;
  state: DehydratedState;
}

/** One household's data must never show for another server or profile (D-30). */
export const cacheOwner = (serverUrl: string, profileId: string | null): string =>
  `${serverUrl}|${profileId ?? ''}`;

/** Search results are not worth the space: only the plain lists and the screens' own data. */
function worthKeeping(queryKey: readonly unknown[]): boolean {
  if (queryKey[0] === 'books' && queryKey[1] === 'list') {
    const params = queryKey[2] as { query?: string } | undefined;
    return !params?.query;
  }
  return true;
}

/**
 * Restores the saved copy into `client` when it belongs to `owner` and is recent enough;
 * otherwise forgets it. Never throws (a broken copy is just ignored).
 */
export async function restoreQueryCache(
  client: QueryClient,
  storage: KeyValueStorage,
  owner: string,
  now: number = Date.now(),
): Promise<boolean> {
  try {
    const raw = await storage.getItem(QUERY_CACHE_KEY);
    if (!raw) return false;
    const snapshot = JSON.parse(raw) as Partial<Snapshot>;
    const { state } = snapshot;
    const usable =
      snapshot.version === VERSION &&
      snapshot.owner === owner &&
      typeof snapshot.savedAt === 'number' &&
      now - snapshot.savedAt <= MAX_CACHE_AGE_MS;
    if (!usable || state === undefined) {
      await storage.removeItem(QUERY_CACHE_KEY);
      return false;
    }
    hydrate(client, state);
    return true;
  } catch {
    return false;
  }
}

/** Writes the successful queries of `client` now. */
export async function saveQueryCache(
  client: QueryClient,
  storage: KeyValueStorage,
  owner: string,
  now: number = Date.now(),
): Promise<void> {
  const state = dehydrate(client, {
    shouldDehydrateQuery: (query) =>
      query.state.status === 'success' && worthKeeping(query.queryKey),
    shouldDehydrateMutation: () => false,
  });
  const snapshot: Snapshot = { version: VERSION, owner, savedAt: now, state };
  try {
    await storage.setItem(QUERY_CACHE_KEY, JSON.stringify(snapshot));
  } catch {
    // Storage full or unavailable: the app still works, only without an offline copy.
  }
}

/**
 * Saves the cache after each successful fetch, at most once per `throttleMs`. Returns the
 * unsubscribe function.
 */
export function persistQueryCache(
  client: QueryClient,
  storage: KeyValueStorage,
  owner: string,
  { throttleMs = 1000 }: { throttleMs?: number } = {},
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const unsubscribe = client.getQueryCache().subscribe((event) => {
    if (event.type !== 'updated' || event.action.type !== 'success') return;
    if (timer !== null) return;
    timer = setTimeout(() => {
      timer = null;
      void saveQueryCache(client, storage, owner);
    }, throttleMs);
  });
  return () => {
    unsubscribe();
    if (timer !== null) clearTimeout(timer);
  };
}
