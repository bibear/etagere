import { palettes } from '@etagere/shared';
import { screen, waitFor } from '@testing-library/react-native';
import { getLocales } from 'expo-localization';
import { Text } from 'react-native';

import { deviceLocale, useI18n } from '../i18n/I18nProvider';
import { SESSION_STORAGE_KEY } from '../session/constants';
import { type KeyValueStorage, useSession } from '../session/SessionProvider';
import { useTheme } from '../theme/ThemeProvider';
import { fakeFetch } from '../test/fakeFetch';
import { TEST_PROFILE, renderWithProviders } from '../test/render';

jest.mock('expo-localization', () => ({ getLocales: jest.fn() }));

function Probe() {
  const { colors, scheme } = useTheme();
  const { t, locale } = useI18n();
  const session = useSession();
  return (
    <Text testID="probe">
      {JSON.stringify({
        scheme,
        background: colors.background,
        locale,
        tab: t('tabs.library'),
        status: session.status,
        profile: session.profile?.name ?? null,
        serverUrl: session.serverUrl,
      })}
    </Text>
  );
}

const probe = () => JSON.parse(String(screen.getByTestId('probe').props.children));

const memoryStorage = (initial: Record<string, string> = {}) => {
  const data = { ...initial };
  const storage: KeyValueStorage = {
    getItem: async (key) => data[key] ?? null,
    setItem: async (key, value) => {
      data[key] = value;
    },
    removeItem: async (key) => {
      delete data[key];
    },
  };
  return { storage, data };
};

describe('ThemeProvider', () => {
  it.each(['light', 'dark'] as const)('provides the %s palette', async (scheme) => {
    await renderWithProviders(<Probe />, { scheme });
    expect(probe()).toMatchObject({ scheme, background: palettes[scheme].background });
  });
});

describe('I18nProvider', () => {
  it.each([
    ['fr', 'Biblio'],
    ['en', 'Library'],
  ] as const)('translates in %s', async (locale, tab) => {
    await renderWithProviders(<Probe />, { locale });
    expect(probe()).toMatchObject({ locale, tab });
  });

  it.each([
    [['fr-FR'], 'fr'],
    [['de-DE', 'en-US'], 'en'],
    [['es-ES'], 'en'],
  ])('picks the device language %j → %s', (tags, expected) => {
    jest.mocked(getLocales).mockReturnValue(tags.map((languageTag) => ({ languageTag })) as never);
    expect(deviceLocale()).toBe(expected);
  });
});

describe('SessionProvider', () => {
  it('loads the saved profile and server address', async () => {
    const { storage } = memoryStorage({
      [SESSION_STORAGE_KEY]: JSON.stringify({
        profile: TEST_PROFILE,
        serverUrl: 'http://10.0.0.2:4848',
      }),
    });
    await renderWithProviders(<Probe />, { storage, session: undefined, defaultUrl: 'http://d' });
    await waitFor(() => expect(probe().status).toBe('ready'));
    expect(probe()).toMatchObject({ profile: 'Bruno', serverUrl: 'http://10.0.0.2:4848' });
  });

  it('starts without a profile on first launch, on the default address', async () => {
    const { storage } = memoryStorage();
    await renderWithProviders(<Probe />, {
      storage,
      session: undefined,
      defaultUrl: 'http://d:4848',
    });
    await waitFor(() => expect(probe().status).toBe('ready'));
    expect(probe()).toMatchObject({ profile: null, serverUrl: 'http://d:4848' });
  });

  it('persists a saved profile and sends its id to the server', async () => {
    const { storage, data } = memoryStorage();
    const server = fakeFetch({ 'GET /api/health': { body: { status: 'ok' } } });
    let session: ReturnType<typeof useSession> | undefined;
    function Capture() {
      session = useSession();
      return null;
    }
    await renderWithProviders(<Capture />, {
      storage,
      session: undefined,
      fetch: server.fetch,
      defaultUrl: 'http://d:4848',
    });
    await waitFor(() => expect(session?.status).toBe('ready'));

    await session?.saveProfile(TEST_PROFILE);
    await waitFor(() => expect(session?.profile).toEqual(TEST_PROFILE));
    await session?.api.health();

    expect(JSON.parse(data[SESSION_STORAGE_KEY] as string).profile).toEqual(TEST_PROFILE);
    expect(server.calls[0]?.headers['x-etagere-profile']).toBe(TEST_PROFILE.id);
  });
});
