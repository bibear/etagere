import type { BookDetail, MyReadingsResponse } from '@etagere/shared';
import { QueryClient } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import BookScreen from '../../app/book/[id]';
import ReadingsScreen from '../../app/(tabs)/readings';
import { queryKeys } from '../api/queryKeys';
import {
  MAX_CACHE_AGE_MS,
  QUERY_CACHE_KEY,
  cacheOwner,
  persistQueryCache,
  restoreQueryCache,
  saveQueryCache,
} from '../offline/persistence';
import type { KeyValueStorage } from '../session/SessionProvider';
import { fakeFetch } from '../test/fakeFetch';
import { ME, bookDetail, bookSummary } from '../test/fixtures';
import { TEST_PROFILE, TEST_SERVER_URL, renderWithProviders } from '../test/render';

jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  useLocalSearchParams: () => ({ id: '11111111-1111-4111-8111-111111111111' }),
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
}));

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

const OWNER = cacheOwner(TEST_SERVER_URL, TEST_PROFILE.id);

const READINGS: MyReadingsResponse = {
  current: {
    book: bookSummary({
      id: '22222222-2222-4222-8222-222222222222',
      title: 'Les Misérables',
      authors: ['Victor Hugo'],
      availability: { state: 'reading', by: ME },
    }),
    startedAt: '2026-10-12T09:00:00.000Z',
    finishedAt: null,
    commentCount: 0,
  },
  finished: [],
  stats: { finishedCount: 23 },
};

/** A storage holding a saved copy made of `entries`, as the app would have written it. */
async function savedCopy(
  entries: [readonly unknown[], unknown][],
  owner = OWNER,
  savedAt?: number,
) {
  const storage = memoryStorage();
  const client = new QueryClient();
  for (const [key, data] of entries) client.setQueryData(key, data);
  await saveQueryCache(client, storage, owner, savedAt);
  return storage;
}

describe('offline copy of the query cache', () => {
  it('restores the copy of the same server and profile', async () => {
    const storage = await savedCopy([[queryKeys.myReadings, READINGS]]);
    const client = new QueryClient();

    expect(await restoreQueryCache(client, storage, OWNER)).toBe(true);
    expect(client.getQueryData(queryKeys.myReadings)).toEqual(READINGS);
  });

  it('forgets a copy from another server or profile', async () => {
    const storage = await savedCopy([[queryKeys.myReadings, READINGS]]);
    const client = new QueryClient();

    expect(await restoreQueryCache(client, storage, cacheOwner('http://other:4848', ME.id))).toBe(
      false,
    );
    expect(client.getQueryData(queryKeys.myReadings)).toBeUndefined();
    expect(storage.data.has(QUERY_CACHE_KEY)).toBe(false);
  });

  it('forgets a copy that is too old', async () => {
    const savedAt = Date.parse('2026-01-01T00:00:00Z');
    const storage = await savedCopy([[queryKeys.myReadings, READINGS]], OWNER, savedAt);

    expect(
      await restoreQueryCache(new QueryClient(), storage, OWNER, savedAt + MAX_CACHE_AGE_MS + 1),
    ).toBe(false);
  });

  it('ignores a broken copy', async () => {
    const storage = memoryStorage();
    storage.data.set(QUERY_CACHE_KEY, '{not json');

    expect(await restoreQueryCache(new QueryClient(), storage, OWNER)).toBe(false);
  });

  it('saves successful results after a fetch, but not search results', async () => {
    const storage = memoryStorage();
    const client = new QueryClient();
    const stop = persistQueryCache(client, storage, OWNER, { throttleMs: 0 });

    await client.fetchQuery({ queryKey: queryKeys.myReadings, queryFn: async () => READINGS });
    await client.fetchQuery({
      queryKey: queryKeys.bookList({ query: 'dune', filter: 'all', sort: 'added' }),
      queryFn: async () => ({ books: [] }),
    });
    await waitFor(() => expect(storage.data.has(QUERY_CACHE_KEY)).toBe(true));
    stop();

    const restored = new QueryClient();
    await restoreQueryCache(restored, storage, OWNER);
    expect(restored.getQueryData(queryKeys.myReadings)).toEqual(READINGS);
    expect(
      restored.getQueryData(queryKeys.bookList({ query: 'dune', filter: 'all', sort: 'added' })),
    ).toBeUndefined();
  });
});

describe('offline read-only mode', () => {
  it('shows the last copy with a banner and disables the actions', async () => {
    const storage = await savedCopy([[queryKeys.myReadings, READINGS]]);
    const api = fakeFetch({ 'GET /api/me/readings': 'offline', 'GET /api/health': 'offline' });

    await renderWithProviders(<ReadingsScreen />, { fetch: api.fetch, storage, persist: true });

    expect(await screen.findByText('Victor Hugo')).toBeTruthy();
    expect(await screen.findByText('Serveur injoignable — dernière copie affichée')).toBeTruthy();
    expect(screen.getByRole('button', { name: "J'ai fini" })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Je le repose' })).toBeDisabled();
  });

  it('comes back online when the server answers again', async () => {
    const storage = await savedCopy([[queryKeys.myReadings, READINGS]]);
    let online = false;
    const fresh = { ...READINGS, stats: { finishedCount: 24 } };
    const api = fakeFetch({
      'GET /api/me/readings': () => {
        if (!online) throw new TypeError('Network request failed');
        return { body: fresh };
      },
      'GET /api/health': () => {
        if (!online) throw new TypeError('Network request failed');
        return { body: { status: 'ok', name: 'Étagère', version: '0.1.0', householdName: 'x' } };
      },
    });

    await renderWithProviders(<ReadingsScreen />, {
      fetch: api.fetch,
      storage,
      persist: true,
      healthPollMs: 20,
    });
    await screen.findByTestId('offline-banner');

    await act(async () => {
      online = true;
    });

    await waitFor(() => expect(screen.queryByTestId('offline-banner')).toBeNull());
    expect(await screen.findByText('24 livres lus · 1 en cours')).toBeTruthy();
    expect(screen.getByRole('button', { name: "J'ai fini" })).toBeEnabled();
  });

  it('keeps the cached book readable and its writes disabled', async () => {
    const book: BookDetail = bookDetail();
    const storage = await savedCopy([
      [queryKeys.book(book.id), book],
      [queryKeys.bookComments(book.id), []],
    ]);
    const offline = fakeFetch({
      [`GET /api/books/${book.id}`]: 'offline',
      [`GET /api/books/${book.id}/comments`]: 'offline',
      'GET /api/health': 'offline',
    });

    await renderWithProviders(<BookScreen />, { fetch: offline.fetch, storage, persist: true });

    expect(await screen.findByRole('header', { name: 'Dune' })).toBeTruthy();
    await screen.findByTestId('offline-banner');
    expect(screen.getByRole('button', { name: 'Je commence la lecture' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Prêter ce livre' })).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText('Ton commentaire'), 'Super');
    expect(screen.getByRole('button', { name: 'Publier le commentaire' })).toBeDisabled();
  });

  it('a failed write also switches to read-only', async () => {
    const book = bookDetail();
    const api = fakeFetch({
      [`GET /api/books/${book.id}`]: { body: book },
      [`GET /api/books/${book.id}/comments`]: { body: { comments: [] } },
      [`POST /api/books/${book.id}/reading/start`]: 'offline',
      'GET /api/health': 'offline',
    });

    await renderWithProviders(<BookScreen />, { fetch: api.fetch });
    await fireEvent.press(await screen.findByRole('button', { name: 'Je commence la lecture' }));

    expect(await screen.findByTestId('offline-banner')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Je commence la lecture' })).toBeDisabled();
  });
});
