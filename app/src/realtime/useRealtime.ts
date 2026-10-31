import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { useSession } from '../session/SessionProvider';
import { type CreateSocket, RealtimeConnection, eventsUrl } from './connection';
import { invalidateForEvent } from './invalidate';

export interface UseRealtimeOptions {
  /** Injected socket (tests); default the platform `WebSocket`. */
  createSocket?: CreateSocket;
  minDelayMs?: number;
  maxDelayMs?: number;
}

/**
 * Keeps a WebSocket to the server's `/api/events` while the device has a profile, and refreshes
 * the cached queries on each event. After a reconnection everything is refreshed (events may
 * have been missed while away).
 */
export function useRealtime({ createSocket, minDelayMs, maxDelayMs }: UseRealtimeOptions = {}) {
  const { status, profile, serverUrl } = useSession();
  const client = useQueryClient();
  const enabled = status === 'ready' && profile !== null;

  useEffect(() => {
    if (!enabled) return;
    const connection = new RealtimeConnection({
      url: eventsUrl(serverUrl),
      onEvent: (event) => {
        invalidateForEvent(client, event).catch(() => {});
      },
      onReconnect: () => {
        client.invalidateQueries().catch(() => {});
      },
      createSocket,
      minDelayMs,
      maxDelayMs,
    });
    connection.start();
    return () => connection.stop();
  }, [enabled, serverUrl, client, createSocket, minDelayMs, maxDelayMs]);
}

/** Mount once under the providers: `<Realtime />`. Renders nothing. */
export function Realtime(props: UseRealtimeOptions) {
  useRealtime(props);
  return null;
}
