import type { BookDetail } from '@etagere/shared';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import BookScreen from '../../app/book/[id]';
import { fakeFetch } from '../test/fakeFetch';
import { JULES, ME, bookDetail } from '../test/fixtures';
import { renderWithProviders } from '../test/render';

jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  useLocalSearchParams: () => ({ id: '11111111-1111-4111-8111-111111111111' }),
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
}));

const BOOK = '/api/books/11111111-1111-4111-8111-111111111111';
const LENT = bookDetail({
  availability: { state: 'lent', borrower: 'Marc', since: '2026-10-05T10:00:00.000Z' },
});

async function renderBook(book: BookDetail, routes: Parameters<typeof fakeFetch>[0] = {}) {
  const api = fakeFetch({
    [`GET ${BOOK}`]: { body: book },
    [`GET ${BOOK}/comments`]: { body: { comments: [] } },
    ...routes,
  });
  await renderWithProviders(<BookScreen />, { fetch: api.fetch });
  return api;
}

const statusLabel = () => screen.getByTestId('status-box').props.accessibilityLabel as string;

describe('Book detail — lend and return', () => {
  it('lends an available book to someone outside the household', async () => {
    const api = await renderBook(bookDetail(), {
      [`POST ${BOOK}/loan`]: { body: LENT },
    });

    await fireEvent.press(await screen.findByRole('button', { name: 'Prêter ce livre' }));
    const lend = screen.getByRole('button', { name: 'Prêter' });
    expect(lend).toBeDisabled();
    expect(
      screen.getByText("Le livre restera indisponible pour le foyer jusqu'à son retour."),
    ).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Prêté à'), '  Marc ');
    await fireEvent.press(lend);

    await waitFor(() =>
      expect(statusLabel()).toBe('Prêté à Marc depuis le 5 oct. Indisponible pour le foyer'),
    );
    expect(screen.queryByTestId('lend-form')).toBeNull();
    expect(screen.getByRole('button', { name: 'Il est revenu' })).toBeTruthy();
    const post = api.calls.find((call) => call.method === 'POST');
    expect(post?.body).toEqual({ borrower: 'Marc' });
    expect(post?.headers['x-etagere-profile']).toBe(ME.id);
  });

  it('cancels the lend form', async () => {
    const api = await renderBook(bookDetail());

    await fireEvent.press(await screen.findByRole('button', { name: 'Prêter ce livre' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Annuler' }));

    expect(screen.queryByTestId('lend-form')).toBeNull();
    expect(screen.getByRole('button', { name: 'Prêter ce livre' })).toBeTruthy();
    expect(api.calls.some((call) => call.method === 'POST')).toBe(false);
  });

  it('marks a lent book as returned', async () => {
    const api = await renderBook(LENT, {
      [`POST ${BOOK}/loan/return`]: { body: bookDetail() },
    });

    await fireEvent.press(await screen.findByRole('button', { name: 'Il est revenu' }));

    await waitFor(() => expect(statusLabel()).toMatch(/^Disponible à la maison/));
    expect(screen.getByRole('button', { name: 'Prêter ce livre' })).toBeTruthy();
    expect(api.calls.some((call) => call.path === `${BOOK}/loan/return`)).toBe(true);
  });

  it('cannot lend a book that someone is reading', async () => {
    await renderBook(bookDetail({ availability: { state: 'reading', by: JULES } }));

    await screen.findByTestId('status-box');
    expect(screen.queryByRole('button', { name: 'Prêter ce livre' })).toBeNull();
  });

  it('shows the real state when the book was taken meanwhile', async () => {
    let taken = false;
    await renderBook(bookDetail(), {
      [`GET ${BOOK}`]: () => ({
        body: taken ? bookDetail({ availability: { state: 'reading', by: JULES } }) : bookDetail(),
      }),
      [`POST ${BOOK}/loan`]: () => {
        taken = true;
        return {
          status: 409,
          body: { code: 'unavailable', availability: { state: 'reading', by: JULES } },
        };
      },
    });

    await fireEvent.press(await screen.findByRole('button', { name: 'Prêter ce livre' }));
    await fireEvent.changeText(screen.getByLabelText('Prêté à'), 'Marc');
    await fireEvent.press(screen.getByRole('button', { name: 'Prêter' }));

    await waitFor(() => expect(statusLabel()).toMatch(/^Jules le lit/));
  });
});
