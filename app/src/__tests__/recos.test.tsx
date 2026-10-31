import type { RecommendationsResponse, Reco } from '@etagere/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { router } from 'expo-router';

import ForYouScreen from '../../app/(tabs)/for-you';
import { fakeFetch } from '../test/fakeFetch';
import { CAMILLE, JULES, ME, bookDetail, bookSummary } from '../test/fixtures';
import { renderWithProviders } from '../test/render';

jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
}));

const HYPERION = bookSummary({
  id: '66666666-6666-4666-8666-666666666666',
  title: 'Hypérion',
  authors: ['Dan Simmons'],
});
const PESTE = bookSummary({
  id: '77777777-7777-4777-8777-777777777777',
  title: 'La Peste',
  authors: ['Camus'],
});
const HORDE = bookSummary({
  id: '88888888-8888-4888-8888-888888888888',
  title: 'La Horde du Contrevent',
  authors: ['Damasio'],
  availability: { state: 'reading', by: JULES },
});

const featured: Reco = {
  book: HYPERION,
  reasons: [{ kind: 'genre', ref: 'Science-fiction', because: ['Dune', 'Fondation'] }],
  quote: {
    author: { name: CAMILLE.name, color: CAMILLE.color },
    text: 'Six histoires dans un seul livre, chacune meilleure que la précédente.',
  },
};

const RECOS: RecommendationsResponse = {
  featured,
  onShelf: [
    {
      book: PESTE,
      reasons: [{ kind: 'author', ref: 'Camus', because: ['L’Étranger'] }],
      quote: null,
    },
    {
      book: HORDE,
      reasons: [{ kind: 'household', ref: 'Jules' }],
      quote: { author: { name: 'Jules', color: JULES.color }, text: 'Le meilleur de l’année' },
    },
  ],
  toBuy: [
    {
      title: 'Les Justes',
      authors: ['Albert Camus'],
      isbn13: '9782070360420',
      coverSourceUrl: 'https://covers.openlibrary.org/b/isbn/9782070360420-L.jpg',
      reason: { kind: 'author', ref: 'Albert Camus' },
    },
    {
      title: 'Sans ISBN',
      authors: [],
      isbn13: null,
      coverSourceUrl: null,
      reason: { kind: 'genre', ref: 'Roman' },
    },
  ],
};

const READINGS = { current: null, finished: [], stats: { finishedCount: 23 } };

async function renderRecos(
  recos: RecommendationsResponse | 'offline' = RECOS,
  routes: Parameters<typeof fakeFetch>[0] = {},
  locale: 'fr' | 'en' = 'fr',
) {
  const api = fakeFetch({
    'GET /api/me/recommendations': recos === 'offline' ? 'offline' : { body: recos },
    'GET /api/me/readings': { body: READINGS },
    ...routes,
  });
  await renderWithProviders(<ForYouScreen />, { fetch: api.fetch, locale });
  return api;
}

beforeEach(() => jest.clearAllMocks());

describe('Recommendations screen', () => {
  it('shows the featured book with its reasons and a household quote', async () => {
    await renderRecos();

    expect(await screen.findByText("D'après tes 23 lectures et les avis du foyer")).toBeTruthy();
    const card = await screen.findByTestId('featured-reco');
    expect(within(card).getByText('Disponible à la maison')).toBeTruthy();
    expect(within(card).getByText('Hypérion')).toBeTruthy();
    expect(within(card).getByText('Dan Simmons')).toBeTruthy();
    expect(within(card).getByText('Parce que tu as aimé Dune et Fondation')).toBeTruthy();
    expect(
      within(card).getByText(
        'Camille : « Six histoires dans un seul livre, chacune meilleure que la précédente. »',
      ),
    ).toBeTruthy();
    expect(within(card).getByRole('button', { name: 'Je commence la lecture' })).toBeTruthy();
  });

  it('lists the other books on the shelf with why and their availability', async () => {
    await renderRecos();

    expect(await screen.findByRole('header', { name: "Aussi sur l'étagère" })).toBeTruthy();
    const peste = screen.getByTestId(`reco-${PESTE.id}`);
    expect(within(peste).getByText('Parce que tu as lu L’Étranger')).toBeTruthy();
    expect(within(peste).getByText('Dispo')).toBeTruthy();
    const horde = screen.getByTestId(`reco-${HORDE.id}`);
    expect(within(horde).getByText('Jules : « Le meilleur de l’année »')).toBeTruthy();
    expect(within(horde).getByText('Jules lit')).toBeTruthy();

    await fireEvent.press(peste);
    expect(router.push).toHaveBeenCalledWith(`/book/${PESTE.id}`);
  });

  it('starts reading the featured book and opens it', async () => {
    const api = await renderRecos(RECOS, {
      [`POST /api/books/${HYPERION.id}/reading/start`]: {
        body: bookDetail({ ...HYPERION, availability: { state: 'reading', by: ME } }),
      },
    });

    await fireEvent.press(await screen.findByRole('button', { name: 'Je commence la lecture' }));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith(`/book/${HYPERION.id}`));
    expect(api.calls.find((call) => call.method === 'POST')?.headers['x-etagere-profile']).toBe(
      ME.id,
    );
  });

  it('offers no start button when the featured book is not available', async () => {
    await renderRecos({
      ...RECOS,
      featured: {
        ...featured,
        book: { ...HYPERION, availability: { state: 'reading', by: JULES } },
      },
    });

    const card = await screen.findByTestId('featured-reco');
    expect(within(card).getByText('Jules lit')).toBeTruthy();
    expect(within(card).queryByRole('button', { name: 'Je commence la lecture' })).toBeNull();
  });

  it('lists ideas to buy; one with an ISBN opens the add form prefilled', async () => {
    await renderRecos();

    expect(await screen.findByRole('header', { name: 'Idées à acheter' })).toBeTruthy();
    const [justes, noIsbn] = screen.getAllByTestId('buy-idea');
    expect(within(justes!).getByText('Tu aimes Albert Camus')).toBeTruthy();
    expect(within(noIsbn!).getByText('Un genre que tu aimes : Roman')).toBeTruthy();
    expect(within(noIsbn!).queryByText('Ajouter')).toBeNull();

    await fireEvent.press(
      screen.getByRole('link', { name: "Je l'ai acheté : ajouter Les Justes" }),
    );
    expect(router.push).toHaveBeenCalledWith('/book/new?isbn=9782070360420');
  });

  it('says when Open Library cannot give ideas to buy', async () => {
    await renderRecos({ ...RECOS, toBuy: [], toBuyError: 'upstream_unavailable' });

    expect(
      await screen.findByText("Open Library ne répond pas : pas d'idées d'achat pour l'instant."),
    ).toBeTruthy();
    expect(screen.getByTestId('featured-reco')).toBeTruthy();
  });

  it('explains an empty shelf', async () => {
    await renderRecos(
      { featured: null, onShelf: [], toBuy: [] },
      {
        'GET /api/me/readings': { body: { ...READINGS, stats: { finishedCount: 0 } } },
      },
    );

    expect(await screen.findByText(/Rien à te proposer pour l'instant/)).toBeTruthy();
    expect(screen.getByText("D'après les avis du foyer")).toBeTruthy();
    expect(screen.getByText('Termine quelques livres pour recevoir des idées.')).toBeTruthy();
  });

  it('offers a retry when the server cannot be reached', async () => {
    await renderRecos('offline');

    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de joindre le serveur.');
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeTruthy();
  });

  it('speaks English', async () => {
    await renderRecos(RECOS, {}, 'en');

    expect(await screen.findByText('Because you liked Dune and Fondation')).toBeTruthy();
    expect(
      screen.getByText(
        'Camille: “Six histoires dans un seul livre, chacune meilleure que la précédente.”',
      ),
    ).toBeTruthy();
    expect(screen.getByText('Because you read L’Étranger')).toBeTruthy();
  });
});
