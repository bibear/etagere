import type { BookDetail } from '@etagere/shared';
import { fireEvent, screen } from '@testing-library/react-native';

import BookScreen from '../../app/book/[id]';
import { fakeFetch } from '../test/fakeFetch';
import { bookDetail } from '../test/fixtures';
import { renderWithProviders } from '../test/render';

const BOOK_ID = '11111111-1111-4111-8111-111111111111';

jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  useLocalSearchParams: () => ({ id: '11111111-1111-4111-8111-111111111111' }),
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
}));

const BOOK = `/api/books/${BOOK_ID}`;
const ENRICH = `POST ${BOOK}/enrich`;
const LONG = `Sur Arrakis, la planète des sables, Paul Atréides découvre l'épice. ${'Le désert attend. '.repeat(30)}`;
const COVER = `/api/covers/${BOOK_ID}.jpg`;

function renderBook(book: BookDetail, routes: Parameters<typeof fakeFetch>[0] = {}) {
  const api = fakeFetch({
    [`GET ${BOOK}`]: { body: book },
    [`GET ${BOOK}/comments`]: { body: { comments: [] } },
    ...routes,
  });
  return { api, render: renderWithProviders(<BookScreen />, { fetch: api.fetch }) };
}

const enrichButton = () => screen.queryByRole('button', { name: 'Compléter la fiche' });

describe('BookScreen — back cover', () => {
  it('shows the back-cover text collapsed to 6 lines, then expanded', async () => {
    await renderBook(bookDetail({ description: LONG, coverUrl: COVER })).render;

    expect(await screen.findByRole('header', { name: 'Quatrième de couverture' })).toBeTruthy();
    expect(screen.getByTestId('back-cover-text').props.numberOfLines).toBe(6);

    await fireEvent.press(screen.getByRole('button', { name: 'Lire la suite' }));
    expect(screen.getByTestId('back-cover-text').props.numberOfLines).toBeUndefined();

    await fireEvent.press(screen.getByRole('button', { name: 'Réduire' }));
    expect(screen.getByTestId('back-cover-text').props.numberOfLines).toBe(6);
  });

  it('shows a short text in full, without "Read more"', async () => {
    await renderBook(bookDetail({ description: 'Un classique.', coverUrl: COVER })).render;
    expect(await screen.findByText('Un classique.')).toBeTruthy();
    expect(screen.getByTestId('back-cover-text').props.numberOfLines).toBeUndefined();
    expect(screen.queryByRole('button', { name: 'Lire la suite' })).toBeNull();
  });

  it('hides the section when the book has no back-cover text', async () => {
    await renderBook(bookDetail({ description: null })).render;
    expect(await screen.findByRole('header', { name: 'Dune' })).toBeTruthy();
    expect(screen.queryByTestId('back-cover')).toBeNull();
    expect(screen.queryByText('Quatrième de couverture')).toBeNull();
  });
});

describe('BookScreen — fill in missing details', () => {
  it.each([
    ['no cover', { coverUrl: null, description: 'Un classique.' }],
    ['no back-cover text', { coverUrl: COVER, description: null }],
  ])('is offered for a book with an ISBN and %s', async (_label, overrides) => {
    await renderBook(bookDetail(overrides)).render;
    expect(await screen.findByRole('header', { name: 'Dune' })).toBeTruthy();
    expect(enrichButton()).toBeTruthy();
  });

  it.each([
    ['a complete book', { coverUrl: COVER, description: 'Un classique.' }],
    ['a book without ISBN', { isbn13: null, coverUrl: null, description: null }],
  ])('is not offered for %s', async (_label, overrides) => {
    await renderBook(bookDetail(overrides)).render;
    expect(await screen.findByRole('header', { name: 'Dune' })).toBeTruthy();
    expect(enrichButton()).toBeNull();
  });

  it('fills the details and shows the back cover', async () => {
    const { api, render } = renderBook(bookDetail(), {
      [ENRICH]: { body: bookDetail({ description: LONG, coverUrl: COVER }) },
    });
    await render;

    await fireEvent.press((await screen.findByRole('button', { name: 'Compléter la fiche' }))!);

    expect(await screen.findByText('Fiche complétée.')).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Quatrième de couverture' })).toBeTruthy();
    expect(enrichButton()).toBeNull();
    expect(api.calls.filter((call) => call.method === 'POST').map((call) => call.path)).toEqual([
      `${BOOK}/enrich`,
    ]);
  });

  it('shows the progress while searching', async () => {
    let answer: (value: { body: BookDetail }) => void = () => {};
    const pending = new Promise<{ body: BookDetail }>((resolve) => (answer = resolve));
    const api = fakeFetch({
      [`GET ${BOOK}`]: { body: bookDetail() },
      [`GET ${BOOK}/comments`]: { body: { comments: [] } },
    });
    const fetch: typeof globalThis.fetch = async (input, init) => {
      if (String(input).endsWith('/enrich')) {
        const { body } = await pending;
        return new Response(JSON.stringify(body), { status: 200 });
      }
      return api.fetch(input, init);
    };
    await renderWithProviders(<BookScreen />, { fetch });

    await fireEvent.press((await screen.findByRole('button', { name: 'Compléter la fiche' }))!);

    expect(await screen.findByText('Recherche en ligne…')).toBeTruthy();
    expect(enrichButton()).toBeNull();
    answer({ body: bookDetail() });
    expect(await screen.findByText('Rien de plus trouvé en ligne pour ce livre.')).toBeTruthy();
  });

  it('explains a failure and lets the member try again', async () => {
    await renderBook(bookDetail(), {
      [ENRICH]: { status: 502, body: { code: 'upstream_unavailable' } },
    }).render;

    await fireEvent.press((await screen.findByRole('button', { name: 'Compléter la fiche' }))!);

    expect(
      await screen.findByText(
        'Les catalogues en ligne (Open Library, Google Books) ne répondent pas. Réessaie plus tard.',
      ),
    ).toBeTruthy();
    expect(enrichButton()).toBeTruthy();
  });

  it('explains a book without ISBN on the server', async () => {
    await renderBook(bookDetail(), {
      [ENRICH]: { status: 409, body: { code: 'no_isbn' } },
    }).render;
    await fireEvent.press((await screen.findByRole('button', { name: 'Compléter la fiche' }))!);
    expect(
      await screen.findByText(
        "Ce livre n'a pas d'ISBN : impossible de chercher sa fiche en ligne.",
      ),
    ).toBeTruthy();
  });
});
