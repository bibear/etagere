import { QueryClient } from '@tanstack/react-query';
import { render } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { AppProviders, type AppProvidersProps } from '../components/AppProviders';
import type { DeviceProfile } from '../session/SessionProvider';

export const TEST_SERVER_URL = 'http://etagere.test:4848';

export const TEST_PROFILE: DeviceProfile = {
  id: '3b241101-e2bb-4255-8caf-4136c566a962',
  name: 'Bruno',
  color: '#1F6B4A',
};

export interface RenderOptions extends Omit<AppProvidersProps, 'children'> {
  /** null renders without a profile (first launch). Default: TEST_PROFILE. */
  profile?: DeviceProfile | null;
}

/**
 * Renders a screen or component inside every app provider, in French and light mode by
 * default, with a signed-in test profile and no retries. Pass `fetch` from `fakeFetch()`.
 */
export function renderWithProviders(ui: ReactElement, options: RenderOptions = {}) {
  const { profile = TEST_PROFILE, ...rest } = options;
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  return render(
    <AppProviders
      locale="fr"
      scheme="light"
      queryClient={queryClient}
      session={{ profile, serverUrl: TEST_SERVER_URL }}
      {...rest}
    >
      {ui}
    </AppProviders>,
  );
}
