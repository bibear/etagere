import type { Profile } from '@etagere/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { router } from 'expo-router';

import ProfileRoute from '../../app/profile';
import type { KeyValueStorage } from '../session/SessionProvider';
import { fakeFetch } from '../test/fakeFetch';
import { CAMILLE, JULES, ME } from '../test/fixtures';
import { TEST_SERVER_URL, renderWithProviders } from '../test/render';

jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
}));

const asProfile = (ref: typeof ME): Profile => ({ ...ref, createdAt: '2026-10-01T10:00:00.000Z' });

function memoryStorage(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (key) => data.get(key) ?? null,
    setItem: async (key, value) => {
      data.set(key, value);
    },
    removeItem: async (key) => {
      data.delete(key);
    },
  };
}

async function renderProfile(
  routes: Parameters<typeof fakeFetch>[0] = {},
  options: { scheme?: 'light' | 'dark'; locale?: 'fr' | 'en' } = {},
) {
  let members = [ME, CAMILLE, JULES].map(asProfile);
  const api = fakeFetch({
    'GET /api/profiles': () => ({ body: { profiles: members } }),
    'GET /api/health': {
      body: { status: 'ok', name: 'Étagère', version: '0.1.0', householdName: 'Les Martin' },
    },
    [`DELETE /api/profiles/${JULES.id}`]: () => {
      members = members.filter((member) => member.id !== JULES.id);
      return { status: 204 };
    },
    ...routes,
  });
  const storage = memoryStorage();
  await renderWithProviders(<ProfileRoute />, { fetch: api.fetch, storage, ...options });
  return { api, storage };
}

beforeEach(() => jest.clearAllMocks());

describe('Profile and household settings', () => {
  it('shows my profile, the household, the server and the app settings', async () => {
    await renderProfile();

    expect(screen.getByRole('header', { name: 'Mon profil' })).toBeTruthy();
    expect(screen.getByLabelText('Ton prénom').props.value).toBe('Bruno');
    expect(screen.getByRole('radio', { name: 'Vert (choisi)' })).toBeChecked();
    expect(await screen.findByText('Bruno (toi)')).toBeTruthy();
    expect(screen.getByText('Camille')).toBeTruthy();
    expect(screen.getByText('Jules')).toBeTruthy();
    expect(await screen.findByLabelText('Les Martin, etagere.test:4848')).toBeTruthy();
    expect(screen.getByLabelText('Langue, Français · suit la langue du téléphone')).toBeTruthy();
    expect(screen.getByLabelText('Thème, Clair · suit le réglage du téléphone')).toBeTruthy();
    // I cannot remove myself from here.
    expect(screen.queryByRole('button', { name: 'Retirer Bruno du foyer' })).toBeNull();
  });

  it('renames me and changes my color on the server and on this device', async () => {
    const { api, storage } = await renderProfile({
      [`PUT /api/profiles/${ME.id}`]: (body) => ({
        body: { ...asProfile(ME), ...(body as object) },
      }),
    });
    const save = screen.getByRole('button', { name: 'Enregistrer' });
    expect(save).toBeDisabled();

    await fireEvent.changeText(screen.getByLabelText('Ton prénom'), '  Bruno S. ');
    await fireEvent.press(screen.getByRole('radio', { name: 'Violet' }));
    await fireEvent.press(save);

    expect(await screen.findByText('Profil enregistré.')).toBeTruthy();
    const put = api.calls.find((call) => call.method === 'PUT');
    expect(put?.body).toEqual({ name: 'Bruno S.', color: '#6B4E8A' });
    expect(put?.headers['x-etagere-profile']).toBe(ME.id);
    const stored = JSON.parse(storage.data.get('etagere.session') ?? '{}');
    expect(stored.profile).toEqual({ id: ME.id, name: 'Bruno S.', color: '#6B4E8A' });
    expect(stored.serverUrl).toBe(TEST_SERVER_URL);
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
  });

  it('refuses a blank name', async () => {
    await renderProfile();

    await fireEvent.changeText(screen.getByLabelText('Ton prénom'), '   ');

    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
  });

  it('removes a household member after a confirmation', async () => {
    const { api } = await renderProfile();

    await fireEvent.press(await screen.findByRole('button', { name: 'Retirer Jules du foyer' }));
    const member = screen.getByTestId(`member-${JULES.id}`);
    expect(within(member).getByText('Retirer Jules du foyer ?')).toBeTruthy();
    expect(
      within(member).getByText(
        'Son historique et ses avis restent. Sa lecture en cours est reposée.',
      ),
    ).toBeTruthy();

    await fireEvent.press(within(member).getByRole('button', { name: 'Oui, retirer' }));

    await waitFor(() => expect(screen.queryByText('Jules')).toBeNull());
    expect(api.calls.some((call) => call.method === 'DELETE')).toBe(true);
  });

  it('cancels a removal', async () => {
    const { api } = await renderProfile();

    await fireEvent.press(await screen.findByRole('button', { name: 'Retirer Camille du foyer' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Annuler' }));

    expect(screen.queryByText('Retirer Camille du foyer ?')).toBeNull();
    expect(api.calls.some((call) => call.method === 'DELETE')).toBe(false);
  });

  it('opens the server settings', async () => {
    await renderProfile();

    await fireEvent.press(screen.getByRole('button', { name: 'Changer de serveur' }));

    expect(router.push).toHaveBeenCalledWith('/server');
  });

  it('says the dark theme follows the phone, in English', async () => {
    await renderProfile({}, { scheme: 'dark', locale: 'en' });

    expect(screen.getByRole('header', { name: 'My profile' })).toBeTruthy();
    expect(screen.getByLabelText('Theme, Dark · follows the phone setting')).toBeTruthy();
    expect(await screen.findByText('Bruno (you)')).toBeTruthy();
  });

  it('explains a failed removal', async () => {
    await renderProfile({
      [`DELETE /api/profiles/${CAMILLE.id}`]: { status: 404, body: { code: 'not_found' } },
    });

    await fireEvent.press(await screen.findByRole('button', { name: 'Retirer Camille du foyer' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Oui, retirer' }));

    expect(await screen.findByRole('alert')).toBeTruthy();
  });
});
