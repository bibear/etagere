import type { MyReadingsResponse, ReadingItem } from '@etagere/shared';
import { fireEvent, screen, within } from '@testing-library/react-native';
import { router } from 'expo-router';

import ReadingsScreen from '../../app/(tabs)/readings';
import { formatMonth, sortFinished } from '../readings/ReadingsScreen';
import { fakeFetch } from '../test/fakeFetch';
import { ME, bookDetail, bookSummary } from '../test/fixtures';
import { renderWithProviders } from '../test/render';

jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
}));

const MISERABLES = bookSummary({
  id: '22222222-2222-4222-8222-222222222222',
  title: 'Les Misérables',
  authors: ['Victor Hugo'],
  availability: { state: 'reading', by: ME },
});

function finished(id: string, title: string, author: string, finishedAt: string, comments = 0) {
  return {
    book: bookSummary({ id, title, authors: [author], readByMe: true }),
    startedAt: null,
    finishedAt,
    commentCount: comments,
  } satisfies ReadingItem;
}

const DUNE = finished(
  '33333333-3333-4333-8333-333333333333',
  'Dune',
  'Frank Herbert',
  '2026-09-20T10:00:00.000Z',
  3,
);
const ETRANGER = finished(
  '44444444-4444-4444-8444-444444444444',
  'L’Étranger',
  'Albert Camus',
  '2026-08-02T10:00:00.000Z',
  1,
);
const ORWELL = finished(
  '55555555-5555-4555-8555-555555555555',
  '1984',
  'George Orwell',
  '2026-06-11T10:00:00.000Z',
);

const READINGS: MyReadingsResponse = {
  current: {
    book: MISERABLES,
    startedAt: '2026-10-12T09:00:00.000Z',
    finishedAt: null,
    commentCount: 0,
  },
  finished: [DUNE, ETRANGER, ORWELL],
  stats: { finishedCount: 23 },
};

async function renderReadings(
  readings: MyReadingsResponse | 'offline' = READINGS,
  routes: Parameters<typeof fakeFetch>[0] = {},
  locale: 'fr' | 'en' = 'fr',
) {
  const api = fakeFetch({
    'GET /api/me/readings': readings === 'offline' ? 'offline' : { body: readings },
    ...routes,
  });
  await renderWithProviders(<ReadingsScreen />, { fetch: api.fetch, locale });
  return api;
}

const rowTitles = () =>
  screen
    .getAllByTestId(/^finished-/)
    .map((row) => [within(row).getAllByText(/./)[0]!.props.children].flat()[0]);

beforeEach(() => jest.clearAllMocks());

describe('My readings screen', () => {
  it('shows the counts, the current reading and the finished books as in the design', async () => {
    await renderReadings();

    expect(await screen.findByText('23 livres lus · 1 en cours')).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Mes lectures' })).toBeTruthy();
    expect(screen.getByRole('header', { name: 'En cours' })).toBeTruthy();
    const current = screen.getByTestId('current-reading');
    expect(within(current).getByText('Victor Hugo')).toBeTruthy();
    expect(within(current).getByText('Commencé le 12 octobre')).toBeTruthy();
    expect(within(current).getByText('Indisponible pour le foyer')).toBeTruthy();
    expect(within(current).getByRole('button', { name: "J'ai fini" })).toBeTruthy();
    expect(within(current).getByRole('button', { name: 'Je le repose' })).toBeTruthy();

    expect(screen.getByRole('header', { name: 'Déjà lus' })).toBeTruthy();
    expect(screen.getByText('Frank Herbert · fini en sept.')).toBeTruthy();
    expect(screen.getByText('3 avis')).toBeTruthy();
    expect(screen.getByText('—')).toBeTruthy();
    expect(rowTitles()).toEqual(['Dune', 'L’Étranger', '1984']);
  });

  it('finishes the current reading and refreshes the screen', async () => {
    let done = false;
    const api = await renderReadings(READINGS, {
      'GET /api/me/readings': () => ({
        body: done
          ? {
              current: null,
              finished: [
                finished(
                  MISERABLES.id,
                  'Les Misérables',
                  'Victor Hugo',
                  '2026-10-30T10:00:00.000Z',
                ),
                DUNE,
              ],
              stats: { finishedCount: 24 },
            }
          : READINGS,
      }),
      [`POST /api/books/${MISERABLES.id}/reading/finish`]: () => {
        done = true;
        return { body: bookDetail({ ...MISERABLES, availability: { state: 'available' } }) };
      },
    });

    await fireEvent.press(await screen.findByRole('button', { name: "J'ai fini" }));

    expect(await screen.findByText('24 livres lus · 0 en cours')).toBeTruthy();
    expect(screen.getByText(/Aucune lecture en cours/)).toBeTruthy();
    const post = api.calls.find((call) => call.method === 'POST');
    expect(post?.path).toBe(`/api/books/${MISERABLES.id}/reading/finish`);
    expect(post?.headers['x-etagere-profile']).toBe(ME.id);
  });

  it('puts the current reading down', async () => {
    const api = await renderReadings(READINGS, {
      [`POST /api/books/${MISERABLES.id}/reading/putdown`]: {
        body: bookDetail({ ...MISERABLES, availability: { state: 'available' } }),
      },
    });

    await fireEvent.press(await screen.findByRole('button', { name: 'Je le repose' }));

    await screen.findByText('23 livres lus · 1 en cours');
    expect(api.calls.some((call) => call.path.endsWith('/reading/putdown'))).toBe(true);
  });

  it('explains a failed action', async () => {
    await renderReadings(READINGS, {
      [`POST /api/books/${MISERABLES.id}/reading/finish`]: {
        status: 409,
        body: { code: 'not_reader', availability: { state: 'available' } },
      },
    });

    await fireEvent.press(await screen.findByRole('button', { name: "J'ai fini" }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Seule la personne qui le lit peut faire ça.',
    );
  });

  it('sorts the finished books by title, then author, then back to the most recent', async () => {
    await renderReadings();
    const sort = await screen.findByRole('button', { name: 'Trier : Les plus récents' });

    await fireEvent.press(sort);
    expect(rowTitles()).toEqual(['1984', 'Dune', 'L’Étranger']);

    await fireEvent.press(screen.getByRole('button', { name: 'Trier : Par titre' }));
    expect(rowTitles()).toEqual(['L’Étranger', 'Dune', '1984']);

    await fireEvent.press(screen.getByRole('button', { name: 'Trier : Par auteur' }));
    expect(rowTitles()).toEqual(['Dune', 'L’Étranger', '1984']);
  });

  it('opens a finished book', async () => {
    await renderReadings();

    await fireEvent.press(
      await screen.findByRole('link', { name: /^Dune, Frank Herbert, fini en sept\., 3 avis$/ }),
    );

    expect(router.push).toHaveBeenCalledWith(`/book/${DUNE.book.id}`);
  });

  it('shows empty states when nothing has been read yet', async () => {
    await renderReadings({ current: null, finished: [], stats: { finishedCount: 0 } });

    expect(await screen.findByText('0 livre lu · 0 en cours')).toBeTruthy();
    expect(screen.getByText(/Aucune lecture en cours/)).toBeTruthy();
    expect(screen.getByText("Aucun livre terminé pour l'instant.")).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Trier/ })).toBeNull();
  });

  it('offers a retry when the server cannot be reached', async () => {
    await renderReadings('offline');

    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de joindre le serveur.');
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeTruthy();
  });

  it('speaks English', async () => {
    await renderReadings(READINGS, {}, 'en');

    expect(await screen.findByText('23 books read · 1 in progress')).toBeTruthy();
    expect(screen.getByText('Frank Herbert · finished in Sept')).toBeTruthy();
  });
});

describe('readings helpers', () => {
  it('adds the year to a month of another year', () => {
    const now = new Date('2026-10-31T12:00:00Z');
    expect(formatMonth('2025-03-10T12:00:00Z', 'fr', now)).toBe('mars 2025');
    expect(formatMonth('2026-03-10T12:00:00Z', 'fr', now)).toBe('mars');
  });

  it('sorts titles ignoring case and accents', () => {
    const items = [
      finished('a', 'été', 'B', 'x'),
      finished('b', 'Zola', 'A', 'x'),
      finished('c', 'Eau', 'C', 'x'),
    ];
    expect(sortFinished(items, 'title', 'fr').map((item) => item.book.title)).toEqual([
      'Eau',
      'été',
      'Zola',
    ]);
  });
});
