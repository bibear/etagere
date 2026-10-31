import type { ColorSchemeName, Locale } from '@etagere/shared';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { type QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { createQueryClient } from '../api/queryClient';
import { I18nProvider } from '../i18n/I18nProvider';
import { PersistedCache } from '../offline/PersistedCache';
import { ServerStatusProvider } from '../offline/ServerStatus';
import { type KeyValueStorage, SessionProvider } from '../session/SessionProvider';
import { ThemeProvider } from '../theme/ThemeProvider';

export interface AppProvidersProps {
  children: ReactNode;
  /** Overrides for tests and previews; production uses the device settings. */
  locale?: Locale;
  scheme?: ColorSchemeName;
  queryClient?: QueryClient;
  storage?: KeyValueStorage;
  fetch?: typeof fetch;
  defaultUrl?: string;
  session?: Parameters<typeof SessionProvider>[0]['initial'];
  /** Saves and restores the query cache on the device (offline copy). The app turns it on. */
  persist?: boolean;
  /** How often an unreachable server is probed again (ms). */
  healthPollMs?: number;
}

/**
 * Every app-wide provider: safe area, theme, i18n, session (profile + API client), queries,
 * server reachability and, with `persist`, the offline copy of the queries.
 */
export function AppProviders({
  children,
  locale,
  scheme,
  queryClient,
  storage,
  fetch,
  defaultUrl,
  session,
  persist = false,
  healthPollMs,
}: AppProvidersProps) {
  const [client] = useState(() => queryClient ?? createQueryClient());
  return (
    <SafeAreaProvider>
      <ThemeProvider scheme={scheme}>
        <I18nProvider locale={locale}>
          <SessionProvider
            storage={storage}
            fetch={fetch}
            defaultUrl={defaultUrl}
            initial={session}
          >
            <QueryClientProvider client={client}>
              <ServerStatusProvider pollMs={healthPollMs}>
                {persist ? (
                  <PersistedCache storage={storage ?? AsyncStorage}>{children}</PersistedCache>
                ) : (
                  children
                )}
              </ServerStatusProvider>
            </QueryClientProvider>
          </SessionProvider>
        </I18nProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
