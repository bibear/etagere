import { useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useEffect, useState } from 'react';

import { type KeyValueStorage, useSession } from '../session/SessionProvider';
import { cacheOwner, persistQueryCache, restoreQueryCache } from './persistence';

/**
 * Restores the saved copy of the query cache before showing the app, then keeps saving it.
 * The copy belongs to one server and one profile.
 */
export function PersistedCache({
  children,
  storage,
}: {
  children: ReactNode;
  storage: KeyValueStorage;
}) {
  const client = useQueryClient();
  const { status, serverUrl, profile } = useSession();
  const owner = cacheOwner(serverUrl, profile?.id ?? null);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    if (status !== 'ready' || restored) return;
    let cancelled = false;
    restoreQueryCache(client, storage, owner).finally(() => {
      if (!cancelled) setRestored(true);
    });
    return () => {
      cancelled = true;
    };
    // Restore once, with the owner known at start.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useEffect(() => {
    if (!restored) return;
    return persistQueryCache(client, storage, owner);
  }, [restored, client, storage, owner]);

  return restored ? children : null;
}
