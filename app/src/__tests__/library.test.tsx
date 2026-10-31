import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { router } from 'expo-router';

import LibraryScreen from '../../app/(tabs)/index';
import { fakeFetch } from '../test/fakeFetch';
import { JULES, bookSummary, booksResponse } from '../test/fixtures';
import { TEST_SERVER_URL, renderWithProviders } from '../test/render';

jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => false },
}));

const DUNE = bookSummary();
const HORDE = bookSummary({
  id: '22222222-2222-4222-8222-222222222222',
  title: 'La Horde du Contrevent',
  authors: ['Alain Damasio'],
  coverUrl: '/api/covers/22222222-2222-4222-8222-222222222222.jpg',
  availability: { state: 'reading', by: JULES },
});
const PRINCE = bookSummary({
  id: '33333333-3333-4333-8333-333333333333',
  title: 'Le Petit Prince',
  authors: ['Saint-Exupéry'],
  availability: { state: 'lent', borrower: 'Marc', since: '2026-10-20T10:00:00.000Z' },
});
const COUNTS = { all: 128, available: 119, reading: 9, lent: 1, unreadByMe: 80 };

beforeEach(() => jest.clearAllMocks());

const booksCalls = (api: ReturnType<typeof fakeFetch>) =>
  api.calls.filter((call) => call.path.startsWith('/api/books'));

describe('LibraryScreen', () => {
  it('shows the counts, the filter chips and the books with their availability', async () => {
    const api = fakeFetch({
      'GET /api/books': { body: booksResponse([DUNE, HORDE, PRINCE], COUNTS) },
    });
    await renderWithProviders(<LibraryScreen />, { fetch: api.fetch });

    expect(await screen.findByText('128 livres à la maison · 9 en lecture')).toBeTruthy();
    for (const chip of [
      'Tous · 128',
      'Disponibles · 119',
      'En lecture · 9',
      'Prêtés · 1',
      'Non lus par moi · 80',
    ]) {
      expect(screen.getByRole('button', { name: chip })).toBeTruthy();
    }
    expect(screen.getByRole('button', { name: 'Tous · 128' })).toBeSelected();
    expect(screen.getByRole('header', { name: 'Ajoutés récemment' })).toBeTruthy();

    const horde = screen.getByRole('link', {
      name: 'La Horde du Contrevent, Alain Damasio, Jules lit',
    });
    expect(within(horde).getByTestId('cover-image').props.source).toEqual({
      uri: `${TEST_SERVER_URL}/api/covers/22222222-2222-4222-8222-222222222222.jpg`,
    });
    expect(
      within(screen.getByRole('link', { name: /^Dune/ })).getByText('Disponible'),
    ).toBeTruthy();
    expect(
      within(screen.getByRole('link', { name: /^Dune/ })).getByTestId('cover-generated', {
        includeHiddenElements: true,
      }),
    ).toBeTruthy();
    expect(screen.getByText('Prêté à Marc')).toBeTruthy();
    expect(booksCalls(api)[0]?.path).toBe('/api/books?filter=all&sort=added');
  });

  it('filters with a chip', async () => {
    const api = fakeFetch({
      'GET /api/books?filter=all&sort=added': { body: booksResponse([DUNE, HORDE], COUNTS) },
      'GET /api/books?filter=reading&sort=added': { body: booksResponse([HORDE], COUNTS) },
    });
    await renderWithProviders(<LibraryScreen />, { fetch: api.fetch });

    await fireEvent.press(await screen.findByRole('button', { name: 'En lecture · 9' }));

    await waitFor(() => expect(screen.queryByRole('link', { name: /^Dune/ })).toBeNull());
    expect(screen.getByRole('link', { name: /^La Horde/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'En lecture · 9' })).toBeSelected();
  });

  it('searches by title, author or ISBN once typing pauses', async () => {
    const api = fakeFetch({
      'GET /api/books?filter=all&sort=added': { body: booksResponse([DUNE, HORDE], COUNTS) },
      'GET /api/books?query=damasio&filter=all&sort=added': {
        body: booksResponse([HORDE], COUNTS),
      },
    });
    await renderWithProviders(<LibraryScreen />, { fetch: api.fetch });
    await screen.findByRole('link', { name: /^Dune/ });

    await fireEvent.changeText(screen.getByLabelText('Rechercher un livre'), 'damasio');

    await waitFor(() => expect(screen.queryByRole('link', { name: /^Dune/ })).toBeNull());
    expect(booksCalls(api).map((call) => call.path)).toEqual([
      '/api/books?filter=all&sort=added',
      '/api/books?query=damasio&filter=all&sort=added',
    ]);
  });

  it('changes the sort order', async () => {
    const api = fakeFetch({ 'GET /api/books': { body: booksResponse([DUNE], COUNTS) } });
    await renderWithProviders(<LibraryScreen />, { fetch: api.fetch });

    await fireEvent.press(await screen.findByRole('button', { name: 'Trier : Par titre' }));

    expect(await screen.findByRole('header', { name: 'Par titre' })).toBeTruthy();
    await waitFor(() =>
      expect(booksCalls(api).at(-1)?.path).toBe('/api/books?filter=all&sort=title'),
    );
  });

  it('opens a book and the profile', async () => {
    const api = fakeFetch({ 'GET /api/books': { body: booksResponse([DUNE], COUNTS) } });
    await renderWithProviders(<LibraryScreen />, { fetch: api.fetch });

    await fireEvent.press(await screen.findByRole('link', { name: /^Dune/ }));
    expect(router.push).toHaveBeenCalledWith(`/book/${DUNE.id}`);

    await fireEvent.press(screen.getByRole('button', { name: 'Mon profil : Bruno' }));
    expect(router.push).toHaveBeenCalledWith('/profile');
  });

  it('invites to scan the first book when the library is empty', async () => {
    const api = fakeFetch({ 'GET /api/books': { body: booksResponse([]) } });
    await renderWithProviders(<LibraryScreen />, { fetch: api.fetch });

    expect(
      await screen.findByText(
        'Aucun livre pour le moment. Scanne le code-barres de ton premier livre !',
      ),
    ).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Scanner un livre' }));
    expect(router.push).toHaveBeenCalledWith('/scan');
  });

  it('says when nothing matches the filter', async () => {
    const api = fakeFetch({ 'GET /api/books': { body: booksResponse([], COUNTS) } });
    await renderWithProviders(<LibraryScreen />, { fetch: api.fetch });

    expect(await screen.findByText('Aucun livre ne correspond.')).toBeTruthy();
  });

  it('says when nothing matches the search, even though the counts then are zero', async () => {
    const api = fakeFetch({
      'GET /api/books?filter=all&sort=added': { body: booksResponse([DUNE], COUNTS) },
      'GET /api/books?query=zzz&filter=all&sort=added': { body: booksResponse([]) },
    });
    await renderWithProviders(<LibraryScreen />, { fetch: api.fetch });
    await screen.findByRole('link', { name: /^Dune/ });

    await fireEvent.changeText(screen.getByLabelText('Rechercher un livre'), 'zzz');

    expect(await screen.findByText('Aucun livre ne correspond.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Scanner un livre' })).toBeNull();
  });

  it('shows an error with a retry when the server is unreachable', async () => {
    let online = false;
    const api = fakeFetch({
      'GET /api/books': () => {
        if (!online) return { status: 500, body: { code: 'internal_error' } };
        return { body: booksResponse([DUNE], COUNTS) };
      },
    });
    await renderWithProviders(<LibraryScreen />, { fetch: api.fetch });

    expect(await screen.findByText('Le serveur a rencontré un problème.')).toBeTruthy();
    online = true;
    await fireEvent.press(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByRole('link', { name: /^Dune/ })).toBeTruthy();
  });

  it('speaks English', async () => {
    const api = fakeFetch({ 'GET /api/books': { body: booksResponse([HORDE], COUNTS) } });
    await renderWithProviders(<LibraryScreen />, { fetch: api.fetch, locale: 'en' });

    expect(await screen.findByText('128 books at home · 9 being read')).toBeTruthy();
    expect(screen.getByText('Jules is reading')).toBeTruthy();
  });
});
