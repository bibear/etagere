import type { BookDetail } from '@etagere/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';

import BookScreen from '../../app/book/[id]';
import { fakeFetch } from '../test/fakeFetch';
import { CAMILLE, JULES, ME, bookDetail, comment } from '../test/fixtures';
import { renderWithProviders } from '../test/render';

const BOOK_ID = '11111111-1111-4111-8111-111111111111';

jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  useLocalSearchParams: () => ({ id: '11111111-1111-4111-8111-111111111111' }),
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
}));

const BOOK = `/api/books/${BOOK_ID}`;
const COMMENTS = `${BOOK}/comments`;

function renderBook(
  book: BookDetail,
  routes: Parameters<typeof fakeFetch>[0] = {},
  comments = [] as ReturnType<typeof comment>[],
) {
  const api = fakeFetch({
    [`GET ${BOOK}`]: { body: book },
    [`GET ${COMMENTS}`]: { body: { comments } },
    ...routes,
  });
  return { api, render: renderWithProviders(<BookScreen />, { fetch: api.fetch }) };
}

const statusBox = () => screen.getByTestId('status-box');

describe('BookScreen — book and reading lock', () => {
  it('shows the book as in the design', async () => {
    const { render } = renderBook(bookDetail({ readBy: [CAMILLE, JULES] }));
    await render;

    expect(await screen.findByRole('header', { name: 'Dune' })).toBeTruthy();
    expect(screen.getByText('Frank Herbert')).toBeTruthy();
    expect(
      screen.getByText('Science-fiction · 1965\nPocket · 928 pages\nAjouté par Camille'),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Bibliothèque' })).toBeTruthy();
    expect(statusBox().props.accessibilityLabel).toBe(
      'Disponible à la maison. Personne ne le lit actuellement',
    );
    expect(screen.getByText('Déjà lu par')).toBeTruthy();
    expect(screen.getByText('Camille, Jules')).toBeTruthy();
  });

  it('starts reading: the book becomes mine and unavailable for the others', async () => {
    const { api, render } = renderBook(bookDetail(), {
      [`POST ${BOOK}/reading/start`]: {
        body: bookDetail({ availability: { state: 'reading', by: ME } }),
      },
    });
    await render;

    await fireEvent.press(await screen.findByRole('button', { name: 'Je commence la lecture' }));

    expect(await screen.findByRole('button', { name: "J'ai fini ce livre" })).toBeTruthy();
    expect(statusBox().props.accessibilityLabel).toBe(
      'Tu le lis en ce moment. Les autres le voient comme indisponible',
    );
    expect(screen.getByRole('button', { name: 'Je le repose' })).toBeTruthy();
    expect(api.calls.find((call) => call.method === 'POST')?.headers['x-etagere-profile']).toBe(
      ME.id,
    );
  });

  it('finishes the reading', async () => {
    const { api, render } = renderBook(bookDetail({ availability: { state: 'reading', by: ME } }), {
      [`POST ${BOOK}/reading/finish`]: {
        body: bookDetail({ readByMe: true, readBy: [ME] }),
      },
    });
    await render;

    await fireEvent.press(await screen.findByRole('button', { name: "J'ai fini ce livre" }));

    await waitFor(() =>
      expect(statusBox().props.accessibilityLabel).toBe("Disponible à la maison. Tu l'as déjà lu"),
    );
    expect(screen.queryByRole('button', { name: "Je l'ai déjà lu" })).toBeNull();
    expect(api.calls.some((call) => call.path === `${BOOK}/reading/finish`)).toBe(true);
  });

  it('puts the book down', async () => {
    const { api, render } = renderBook(bookDetail({ availability: { state: 'reading', by: ME } }), {
      [`POST ${BOOK}/reading/putdown`]: { body: bookDetail() },
    });
    await render;

    await fireEvent.press(await screen.findByRole('button', { name: 'Je le repose' }));

    expect(await screen.findByRole('button', { name: 'Je commence la lecture' })).toBeTruthy();
    expect(api.calls.some((call) => call.path === `${BOOK}/reading/putdown`)).toBe(true);
  });

  it('marks the book as already read', async () => {
    const { render } = renderBook(bookDetail(), {
      [`POST ${BOOK}/reading/already-read`]: {
        body: bookDetail({ readByMe: true, readBy: [ME] }),
      },
    });
    await render;

    await fireEvent.press(await screen.findByRole('button', { name: "Je l'ai déjà lu" }));

    expect(await screen.findByText('Bruno')).toBeTruthy();
    expect(screen.queryByRole('button', { name: "Je l'ai déjà lu" })).toBeNull();
  });

  it('shows who is reading it and offers no start', async () => {
    const { render } = renderBook(bookDetail({ availability: { state: 'reading', by: JULES } }));
    await render;

    await screen.findByRole('header', { name: 'Dune' });
    expect(statusBox().props.accessibilityLabel).toBe(
      'Jules le lit en ce moment. Indisponible pour le foyer',
    );
    expect(screen.queryByRole('button', { name: 'Je commence la lecture' })).toBeNull();
  });

  it('shows a lent book', async () => {
    const { render } = renderBook(
      bookDetail({
        availability: { state: 'lent', borrower: 'Marc', since: '2026-09-12T10:00:00.000Z' },
      }),
    );
    await render;

    await screen.findByRole('header', { name: 'Dune' });
    expect(statusBox().props.accessibilityLabel).toBe(
      'Prêté à Marc depuis le 12 sept. Indisponible pour le foyer',
    );
  });

  it('refreshes and explains when someone took the book meanwhile', async () => {
    let taken = false;
    const { render } = renderBook(bookDetail(), {
      [`GET ${BOOK}`]: () => ({
        body: taken ? bookDetail({ availability: { state: 'reading', by: JULES } }) : bookDetail(),
      }),
      [`POST ${BOOK}/reading/start`]: () => {
        taken = true;
        return {
          status: 409,
          body: { code: 'unavailable', availability: { state: 'reading', by: JULES } },
        };
      },
    });
    await render;

    await fireEvent.press(await screen.findByRole('button', { name: 'Je commence la lecture' }));

    expect(await screen.findByText("Ce livre n'est pas disponible.")).toBeTruthy();
    await waitFor(() =>
      expect(statusBox().props.accessibilityLabel).toBe(
        'Jules le lit en ce moment. Indisponible pour le foyer',
      ),
    );
  });

  it('says when the book no longer exists', async () => {
    const { render } = renderBook(bookDetail(), {
      [`GET ${BOOK}`]: { status: 404, body: { code: 'not_found' } },
    });
    await render;

    expect(await screen.findByText("Ce livre n'est plus dans la bibliothèque.")).toBeTruthy();
  });
});

describe('BookScreen — household reviews', () => {
  const MINE = comment({
    id: 'c0000000-0000-4000-8000-000000000002',
    author: ME,
    text: 'Lu avant de voir les films.',
  });
  const THEIRS = comment();

  it('lists the reviews with their author', async () => {
    const { render } = renderBook(bookDetail({ commentCount: 2 }), {}, [MINE, THEIRS]);
    await render;

    expect(await screen.findByRole('header', { name: 'Avis du foyer · 2' })).toBeTruthy();
    const theirs = screen.getByTestId(`comment-${THEIRS.id}`);
    expect(within(theirs).getByText('Camille')).toBeTruthy();
    expect(within(theirs).getByText('Le début est dense, accrochez-vous.')).toBeTruthy();
    expect(within(theirs).getByText('12 sept. 2025')).toBeTruthy();
    expect(within(theirs).queryByRole('button', { name: 'Modifier' })).toBeNull();
    expect(
      within(screen.getByTestId(`comment-${MINE.id}`)).getByRole('button', { name: 'Modifier' }),
    ).toBeTruthy();
  });

  it('invites to write the first review', async () => {
    const { render } = renderBook(bookDetail());
    await render;
    expect(
      await screen.findByText("Pas encore d'avis. Sois le premier à en laisser un !"),
    ).toBeTruthy();
  });

  it('posts a review', async () => {
    let comments = [THEIRS];
    const { api, render } = renderBook(bookDetail(), {
      [`GET ${COMMENTS}`]: () => ({ body: { comments } }),
      [`POST ${COMMENTS}`]: (body) => {
        const created = comment({
          id: 'c0000000-0000-4000-8000-000000000003',
          author: ME,
          text: (body as { text: string }).text,
        });
        comments = [created, ...comments];
        return { status: 201, body: created };
      },
    });
    await render;

    const send = await screen.findByRole('button', { name: 'Publier le commentaire' });
    expect(send).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText('Ton commentaire'), 'Impossible à lâcher.');
    await fireEvent.press(send);

    expect(await screen.findByText('Impossible à lâcher.')).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Avis du foyer · 2' })).toBeTruthy();
    expect(screen.getByLabelText('Ton commentaire').props.value).toBe('');
    expect(api.calls.find((call) => call.method === 'POST')?.body).toEqual({
      text: 'Impossible à lâcher.',
    });
  });

  it('edits my review', async () => {
    let text = MINE.text;
    const { api, render } = renderBook(bookDetail(), {
      [`GET ${COMMENTS}`]: () => ({ body: { comments: [{ ...MINE, text }] } }),
      [`PATCH /api/comments/${MINE.id}`]: (body) => {
        text = (body as { text: string }).text;
        return { body: { ...MINE, text } };
      },
    });
    await render;

    await fireEvent.press(await screen.findByRole('button', { name: 'Modifier' }));
    await fireEvent.changeText(screen.getByLabelText('Modifier ton avis'), 'Encore mieux relu.');
    await fireEvent.press(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText('Encore mieux relu.')).toBeTruthy();
    expect(api.calls.find((call) => call.method === 'PATCH')?.body).toEqual({
      text: 'Encore mieux relu.',
    });
  });

  it('deletes my review after confirmation', async () => {
    let comments = [MINE, THEIRS];
    const { api, render } = renderBook(bookDetail(), {
      [`GET ${COMMENTS}`]: () => ({ body: { comments } }),
      [`DELETE /api/comments/${MINE.id}`]: () => {
        comments = [THEIRS];
        return { status: 204 };
      },
    });
    await render;

    await fireEvent.press(await screen.findByRole('button', { name: 'Supprimer' }));
    expect(api.calls.some((call) => call.method === 'DELETE')).toBe(false);
    await fireEvent.press(screen.getByRole('button', { name: 'Confirmer la suppression' }));

    await waitFor(() => expect(screen.queryByText(MINE.text)).toBeNull());
    expect(screen.getByRole('header', { name: 'Avis du foyer · 1' })).toBeTruthy();
  });
});
