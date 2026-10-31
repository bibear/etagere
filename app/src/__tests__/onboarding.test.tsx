import { QueryClient } from '@tanstack/react-query';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Slot } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';

import TabsLayout from '../../app/(tabs)/_layout';
import ForYouScreen from '../../app/(tabs)/for-you';
import LibraryScreen from '../../app/(tabs)/index';
import ReadingsScreen from '../../app/(tabs)/readings';
import ScanScreen from '../../app/(tabs)/scan';
import OnboardingScreen from '../../app/onboarding';
import ServerSettingsScreen from '../../app/server';
import { AppProviders } from '../components/AppProviders';
import type { DeviceProfile, KeyValueStorage } from '../session/SessionProvider';
import { SESSION_STORAGE_KEY } from '../session/constants';
import { type FakeFetch, fakeFetch } from '../test/fakeFetch';
import { booksResponse } from '../test/fixtures';
import { TEST_PROFILE } from '../test/render';

const NEW_ID = '9d3f2c1b-7a6e-4f5d-8c4b-3a2f1e0d9c8b';
jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => '9d3f2c1b-7a6e-4f5d-8c4b-3a2f1e0d9c8b'),
}));

const SERVER = 'http://etagere.local:4848';
const SERVER_INFO = { version: '0.2.0', bookCount: 128, profileCount: 4, urls: [SERVER] };
const HEALTH = { status: 'ok', name: 'Étagère', version: '0.2.0', householdName: 'La maison' };

const memoryStorage = () => {
  const data: Record<string, string> = {};
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

async function renderApp(
  api: FakeFetch,
  {
    profile = null,
    initialUrl = '/',
  }: { profile?: DeviceProfile | null; initialUrl?: string } = {},
) {
  const { storage, data } = memoryStorage();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  await renderRouter(
    {
      _layout: () => (
        <AppProviders
          locale="fr"
          scheme="light"
          fetch={api.fetch}
          storage={storage}
          queryClient={queryClient}
          session={{ profile, serverUrl: null }}
          defaultUrl={SERVER}
        >
          <Slot />
        </AppProviders>
      ),
      '(tabs)/_layout': TabsLayout,
      '(tabs)/index': LibraryScreen,
      '(tabs)/readings': ReadingsScreen,
      '(tabs)/scan': ScanScreen,
      '(tabs)/for-you': ForYouScreen,
      onboarding: OnboardingScreen,
      server: ServerSettingsScreen,
    },
    { initialUrl },
  );
  return { data };
}

const libraryRoutes = {
  'GET /api/books': { body: booksResponse([]) },
};

describe('first launch', () => {
  it('shows the onboarding instead of the tabs while the device has no profile', async () => {
    await renderApp(fakeFetch({ 'GET /api/server-info': { body: SERVER_INFO } }));

    expect(await screen.findByRole('header', { name: 'Bienvenue sur Étagère' })).toBeTruthy();
    expect(screen).toHavePathname('/onboarding');
  });

  it('describes the library found on the network', async () => {
    await renderApp(fakeFetch({ 'GET /api/server-info': { body: SERVER_INFO } }));

    expect(await screen.findByText('Bibliothèque trouvée')).toBeTruthy();
    expect(screen.getByText('etagere.local · 128 livres · 4 membres')).toBeTruthy();
  });

  it('says when no library answers', async () => {
    await renderApp(fakeFetch({ 'GET /api/server-info': 'offline' }));

    expect(await screen.findByText('Aucune bibliothèque trouvée')).toBeTruthy();
    expect(
      screen.getByText('Vérifie que le serveur tourne sur le Wi-Fi de la maison.'),
    ).toBeTruthy();
  });

  it('creates the profile with the first name and color, then opens the library', async () => {
    const api = fakeFetch({
      'GET /api/server-info': { body: SERVER_INFO },
      [`PUT /api/profiles/${NEW_ID}`]: (body) => ({
        body: { id: NEW_ID, ...(body as object), createdAt: '2026-10-31T10:00:00.000Z' },
      }),
      ...libraryRoutes,
    });
    const { data } = await renderApp(api);

    const enter = await screen.findByRole('button', { name: 'Entrer dans la bibliothèque' });
    expect(enter).toBeDisabled();

    await fireEvent.changeText(screen.getByLabelText('Ton prénom'), '  Inès ');
    await fireEvent.press(screen.getByRole('radio', { name: 'Violet' }));
    expect(screen.getByRole('radio', { name: 'Violet (choisi)' })).toBeChecked();
    await fireEvent.press(enter);

    expect(await screen.findByRole('header', { name: 'La bibliothèque' })).toBeTruthy();
    const put = api.calls.find((call) => call.method === 'PUT');
    expect(put).toMatchObject({
      path: `/api/profiles/${NEW_ID}`,
      body: { name: 'Inès', color: '#6B4E8A' },
    });
    expect(put?.headers['x-etagere-profile']).toBeUndefined();
    expect(JSON.parse(data[SESSION_STORAGE_KEY] ?? '{}')).toMatchObject({
      profile: { id: NEW_ID, name: 'Inès', color: '#6B4E8A' },
    });
    // The library then asks the server as the new profile.
    await waitFor(() => expect(api.calls.at(-1)?.headers['x-etagere-profile']).toBe(NEW_ID));
  });

  it('keeps the form and explains when the server refuses', async () => {
    const api = fakeFetch({
      'GET /api/server-info': { body: SERVER_INFO },
      [`PUT /api/profiles/${NEW_ID}`]: { status: 403, body: { code: 'outside_lan' } },
    });
    await renderApp(api);

    await fireEvent.changeText(await screen.findByLabelText('Ton prénom'), 'Bruno');
    await fireEvent.press(screen.getByRole('button', { name: 'Entrer dans la bibliothèque' }));

    expect(
      await screen.findByText('Le serveur ne répond que sur le Wi-Fi de la maison.'),
    ).toBeTruthy();
    expect(screen).toHavePathname('/onboarding');
  });

  it('retries with the same profile id, so a lost answer never creates a second member', async () => {
    const { randomUUID } = jest.requireMock<{ randomUUID: jest.Mock }>('expo-crypto');
    randomUUID
      .mockReturnValueOnce(NEW_ID)
      .mockReturnValueOnce('0b5c4d3e-2f1a-4b9c-8d7e-6f5a4b3c2d1e');
    let attempts = 0;
    const api = fakeFetch({
      'GET /api/server-info': { body: SERVER_INFO },
      // The first answer is lost (the server may have created the profile anyway).
      [`PUT /api/profiles/${NEW_ID}`]: (body) =>
        ++attempts === 1
          ? { status: 500, body: { code: 'internal_error' } }
          : { body: { id: NEW_ID, ...(body as object), createdAt: '2026-10-31T10:00:00.000Z' } },
      ...libraryRoutes,
    });
    await renderApp(api);

    await fireEvent.changeText(await screen.findByLabelText('Ton prénom'), 'Inès');
    const enter = screen.getByRole('button', { name: 'Entrer dans la bibliothèque' });
    await fireEvent.press(enter);
    await waitFor(() => expect(attempts).toBe(1));
    await waitFor(() => expect(enter).toBeEnabled());
    await fireEvent.press(enter);

    expect(await screen.findByRole('header', { name: 'La bibliothèque' })).toBeTruthy();
    const puts = api.calls.filter((call) => call.method === 'PUT').map((call) => call.path);
    expect(puts).toEqual([`/api/profiles/${NEW_ID}`, `/api/profiles/${NEW_ID}`]);
  });

  it('opens the library directly when a profile exists', async () => {
    await renderApp(fakeFetch(libraryRoutes), { profile: TEST_PROFILE });
    expect(await screen.findByRole('header', { name: 'La bibliothèque' })).toBeTruthy();
    expect(screen).toHavePathname('/');
  });
});

describe('server settings', () => {
  it('opens from the onboarding link', async () => {
    await renderApp(fakeFetch({ 'GET /api/server-info': { body: SERVER_INFO } }));

    await fireEvent.press(await screen.findByText("Saisir l'adresse du serveur"));

    expect(await screen.findByRole('header', { name: 'Adresse du serveur' })).toBeTruthy();
    expect(screen.getByLabelText('Adresse').props.value).toBe(SERVER);
  });

  it('tests a typed address against its health endpoint', async () => {
    const api = fakeFetch({ 'GET /api/health': { body: HEALTH } });
    await renderApp(api, { profile: TEST_PROFILE, initialUrl: '/server' });

    await fireEvent.changeText(await screen.findByLabelText('Adresse'), '192.168.1.20');
    await fireEvent.press(screen.getByRole('button', { name: "Tester l'adresse" }));

    expect(
      await screen.findByText('Bibliothèque « La maison » trouvée · version 0.2.0'),
    ).toBeTruthy();
    expect(api.calls.at(-1)?.url).toBe('http://192.168.1.20:4848/api/health');
  });

  it('rejects text that is not an address', async () => {
    const api = fakeFetch({});
    await renderApp(api, { profile: TEST_PROFILE, initialUrl: '/server' });

    await fireEvent.changeText(await screen.findByLabelText('Adresse'), 'http://');
    await fireEvent.press(screen.getByRole('button', { name: "Tester l'adresse" }));

    expect(await screen.findByText("Cette adresse n'est pas valide.")).toBeTruthy();
    expect(api.calls).toHaveLength(0);
  });

  it('does not save an address that does not answer', async () => {
    const api = fakeFetch({ 'GET /api/health': 'offline' });
    const { data } = await renderApp(api, { profile: TEST_PROFILE, initialUrl: '/server' });

    await fireEvent.changeText(await screen.findByLabelText('Adresse'), '10.0.0.9');
    await fireEvent.press(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText('Impossible de joindre le serveur.')).toBeTruthy();
    expect(data[SESSION_STORAGE_KEY]).toBeUndefined();
  });

  it('registers the device profile on the new server before switching to it', async () => {
    const api = fakeFetch({
      'GET /api/health': { body: HEALTH },
      [`PUT /api/profiles/${TEST_PROFILE.id}`]: {
        body: { ...TEST_PROFILE, createdAt: '2026-10-31T10:00:00.000Z' },
      },
      ...libraryRoutes,
    });
    const { data } = await renderApp(api, { profile: TEST_PROFILE, initialUrl: '/server' });

    await fireEvent.changeText(await screen.findByLabelText('Adresse'), '192.168.1.30');
    await fireEvent.press(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() =>
      expect(JSON.parse(data[SESSION_STORAGE_KEY] ?? '{}')).toMatchObject({
        serverUrl: 'http://192.168.1.30:4848',
      }),
    );
    const put = api.calls.find((call) => call.method === 'PUT');
    expect(put?.url).toBe(`http://192.168.1.30:4848/api/profiles/${TEST_PROFILE.id}`);
    expect(put?.body).toEqual({ name: TEST_PROFILE.name, color: TEST_PROFILE.color });
    expect(put?.headers['x-etagere-profile']).toBe(TEST_PROFILE.id);
  });

  it('keeps the old server when the new one refuses the profile', async () => {
    const api = fakeFetch({
      'GET /api/health': { body: HEALTH },
      [`PUT /api/profiles/${TEST_PROFILE.id}`]: {
        status: 400,
        body: { code: 'invalid_input', fields: ['color'] },
      },
    });
    const { data } = await renderApp(api, { profile: TEST_PROFILE, initialUrl: '/server' });

    await fireEvent.changeText(await screen.findByLabelText('Adresse'), '192.168.1.30');
    await fireEvent.press(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText(/valide/)).toBeTruthy();
    expect(data[SESSION_STORAGE_KEY]).toBeUndefined();
  });

  it('saves a working address and uses it from then on', async () => {
    const api = fakeFetch({
      'GET /api/health': { body: HEALTH },
      'GET /api/server-info': { body: SERVER_INFO },
    });
    const { data } = await renderApp(api);

    await fireEvent.press(await screen.findByText("Saisir l'adresse du serveur"));
    await fireEvent.changeText(await screen.findByLabelText('Adresse'), 'maison.local:5000');
    await fireEvent.press(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByRole('header', { name: 'Bienvenue sur Étagère' })).toBeTruthy();
    expect(JSON.parse(data[SESSION_STORAGE_KEY] ?? '{}')).toMatchObject({
      serverUrl: 'http://maison.local:5000',
    });
    expect(await screen.findByText('maison.local · 128 livres · 4 membres')).toBeTruthy();
    expect(api.calls.at(-1)?.url).toBe('http://maison.local:5000/api/server-info');
  });
});
