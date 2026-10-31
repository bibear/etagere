import { useQueryClient } from '@tanstack/react-query';
import { type ReactNode, createContext, useContext, useEffect, useState } from 'react';

import { ApiError } from '../api/client';
import { useSession } from '../session/SessionProvider';

const OfflineContext = createContext(false);

const isNetworkError = (error: unknown) => error instanceof ApiError && error.status === 0;

/**
 * Tracks whether the server answers: a network failure of any query or mutation switches to
 * offline (read-only), any success switches back. While offline, `/api/health` is polled every
 * `pollMs`; when it answers again every query is refreshed.
 */
export function ServerStatusProvider({
  children,
  pollMs = 10_000,
}: {
  children: ReactNode;
  pollMs?: number;
}) {
  const client = useQueryClient();
  const { api, serverUrl } = useSession();
  const [offline, setOffline] = useState(false);

  // Another server: start optimistic again.
  useEffect(() => setOffline(false), [serverUrl]);

  useEffect(() => {
    const onResult = (type: string, error: unknown) => {
      if (type === 'success') setOffline(false);
      else if (type === 'error' && isNetworkError(error)) setOffline(true);
    };
    const stopQueries = client.getQueryCache().subscribe((event) => {
      if (event.type === 'updated') {
        onResult(event.action.type, 'error' in event.action ? event.action.error : null);
      }
    });
    const stopMutations = client.getMutationCache().subscribe((event) => {
      if (event.type === 'updated') {
        onResult(event.action.type, 'error' in event.action ? event.action.error : null);
      }
    });
    return () => {
      stopQueries();
      stopMutations();
    };
  }, [client]);

  useEffect(() => {
    if (!offline) return;
    let cancelled = false;
    const timer = setInterval(() => {
      api.health().then(
        () => {
          if (cancelled) return;
          setOffline(false);
          client.invalidateQueries().catch(() => {});
        },
        () => {},
      );
    }, pollMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [offline, api, client, pollMs]);

  return <OfflineContext.Provider value={offline}>{children}</OfflineContext.Provider>;
}

/** True while the server cannot be reached: screens show the saved copy, read-only. */
export const useOffline = (): boolean => useContext(OfflineContext);
