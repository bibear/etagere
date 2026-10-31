import type { BookDetail } from '@etagere/shared';
import { QueryClient } from '@tanstack/react-query';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Stack } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';
import { Text } from 'react-native';

import BookScreen from '../../app/book/[id]';
import EditBookRoute from '../../app/book/edit/[id]';
import NewBookRoute from '../../app/book/new';
import { AppProviders } from '../components/AppProviders';
import { type FakeResponse, fakeFetch } from '../test/fakeFetch';
import { TEST_PROFILE, TEST_SERVER_URL } from '../test/render';

const BOOK: BookDetail = {
  id: 'b1',
  isbn13: '9782352940159',
  title: 'Le Nom du vent',
  authors: ['Patrick Rothfuss'],
  coverUrl: null,
  addedAt: '2026-10-01T10:00:00.000Z',
  availability: { state: 'available' },
  readByMe: false,
  genres: ['Fantasy'],
  publisher: 'Bragelonne',
  year: 2009,
  pages: 662,
  description: null,
  source: 'lookup',
  addedBy: { id: TEST_PROFILE.id, name: 'Bruno', color: '#1F6B4A' },
  readBy: [],
  commentCount: 0,
};

type Routes = Parameters<typeof fakeFetch>[0];

async function renderAt(
  initialUrl: string,
  routes: Routes,
  locale: 'fr' | 'en' = 'fr',
  realDetail = false,
) {
  const server = fakeFetch(routes);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  const Layout = () => (
    <AppProviders
      locale={locale}
      scheme="light"
      queryClient={queryClient}
      fetch={server.fetch}
      session={{ profile: TEST_PROFILE, serverUrl: TEST_SERVER_URL }}
    >
      <Stack screenOptions={{ headerShown: false }} />
    </AppProviders>
  );
  const view = await renderRouter(
    {
      _layout: Layout,
      index: () => <Text>Library stub</Text>,
      'book/new': NewBookRoute,
      'book/edit/[id]': EditBookRoute,
      'book/[id]': realDetail ? BookScreen : () => <Text>Detail stub</Text>,
    },
    { initialUrl },
  );
  return { server, view };
}

const type = (label: string, text: string) =>
  fireEvent.changeText(screen.getByLabelText(label), text);
const press = (label: string) => fireEvent.press(screen.getByRole('button', { name: label }));

describe('add a book by hand', () => {
  it('posts the typed book and opens it', async () => {
    const { server } = await renderAt('/book/new', {
      'POST /api/books': (body): FakeResponse => ({
        status: 201,
        body: { ...BOOK, ...(body as object), id: 'b9' },
      }),
    });
    expect(await screen.findByRole('header', { name: 'Ajouter un livre' })).toBeTruthy();

    await type('Titre', 'Dune');
    await type('Auteurs', 'Frank Herbert');
    await type('Genres', 'SF, Classique');
    await type('Année', '1965');
    await press('Ajouter à la bibliothèque');

    expect(await screen.findByText('Detail stub')).toBeTruthy();
    expect(screen).toHavePathname('/book/b9');
    const post = server.calls.find((call) => call.method === 'POST');
    expect(post?.body).toEqual({
      isbn13: null,
      title: 'Dune',
      authors: ['Frank Herbert'],
      genres: ['SF', 'Classique'],
      publisher: null,
      year: 1965,
      pages: null,
      description: null,
      coverSourceUrl: null,
    });
    expect(post?.headers['x-etagere-profile']).toBe(TEST_PROFILE.id);
  });

  it('requires a title and flags invalid numbers before sending anything', async () => {
    const { server } = await renderAt('/book/new', {});
    await screen.findByRole('header', { name: 'Ajouter un livre' });

    await type('Pages', 'beaucoup');
    await press('Ajouter à la bibliothèque');

    expect(await screen.findByText('Obligatoire')).toBeTruthy();
    expect(screen.getByText('Valeur non valide')).toBeTruthy();
    expect(server.calls).toHaveLength(0);
  });

  it('fills the form from an ISBN lookup and sends the cover source', async () => {
    const cover = 'https://covers.openlibrary.org/b/isbn/9782352940159-L.jpg';
    const { server } = await renderAt('/book/new', {
      'GET /api/lookup/978-2-35294-015-9': {
        body: {
          isbn13: '9782352940159',
          title: 'Le Nom du vent',
          authors: ['Patrick Rothfuss'],
          genres: ['Fantasy'],
          publisher: 'Bragelonne',
          year: 2009,
          coverSourceUrl: cover,
        },
      },
      'POST /api/books': { status: 201, body: BOOK },
    });
    await screen.findByRole('header', { name: 'Ajouter un livre' });

    await type('ISBN', '978-2-35294-015-9');
    await press('Compléter avec Open Library');

    expect(await screen.findByDisplayValue('Le Nom du vent')).toBeTruthy();
    expect(screen.getByDisplayValue('Bragelonne')).toBeTruthy();
    expect(screen.getByText(/Fiche complétée depuis Open Library/)).toBeTruthy();

    await press('Ajouter à la bibliothèque');
    await screen.findByText('Detail stub');
    expect(server.calls.at(-1)?.body).toMatchObject({
      isbn13: '9782352940159',
      year: 2009,
      coverSourceUrl: cover,
    });
  });

  it('explains when Open Library does not know the ISBN', async () => {
    await renderAt('/book/new?isbn=9782070368228', {
      'GET /api/lookup/9782070368228': { status: 404, body: { code: 'not_found' } },
    });
    expect(await screen.findByDisplayValue('9782070368228')).toBeTruthy();

    await press('Compléter avec Open Library');

    expect(await screen.findByText(/Open Library ne connaît pas cet ISBN/)).toBeTruthy();
  });

  it('points to the existing book when the ISBN is already in the library', async () => {
    await renderAt('/book/new?isbn=9782352940159', {
      'POST /api/books': { status: 409, body: { code: 'already_in_library', book: BOOK } },
    });
    await screen.findByDisplayValue('9782352940159');
    await type('Titre', 'Le Nom du vent');
    await press('Ajouter à la bibliothèque');

    expect(await screen.findByText('Ce livre est déjà dans la bibliothèque.')).toBeTruthy();
    await press('Voir le livre');
    expect(await screen.findByText('Detail stub')).toBeTruthy();
    expect(screen).toHavePathname('/book/b1');
  });

  it('highlights the fields the server rejected', async () => {
    await renderAt('/book/new', {
      'POST /api/books': { status: 400, body: { code: 'invalid_input', fields: ['publisher'] } },
    });
    await screen.findByRole('header', { name: 'Ajouter un livre' });
    await type('Titre', 'X');
    await type('Éditeur', 'Y');
    await press('Ajouter à la bibliothèque');

    expect(await screen.findByText('Valeur non valide')).toBeTruthy();
    expect(screen.getByText('Certaines informations ne sont pas valides.')).toBeTruthy();
  });

  it('is translated in English', async () => {
    await renderAt('/book/new', {}, 'en');
    expect(await screen.findByRole('header', { name: 'Add a book' })).toBeTruthy();
    expect(screen.getByLabelText('Title')).toBeTruthy();
  });
});

describe('edit and delete a book', () => {
  it('opens the edit form from the book detail', async () => {
    await renderAt(
      '/book/b1',
      {
        'GET /api/books/b1': { body: BOOK },
        'GET /api/books/b1/comments': { body: { comments: [] } },
      },
      'fr',
      true,
    );
    await fireEvent.press(await screen.findByRole('button', { name: 'Modifier le livre' }));

    expect(await screen.findByRole('header', { name: 'Modifier le livre' })).toBeTruthy();
    expect(screen).toHavePathname('/book/edit/b1');
  });

  it('prefills the book and patches the changes', async () => {
    const { server } = await renderAt('/book/edit/b1', {
      'GET /api/books/b1': { body: BOOK },
      'PATCH /api/books/b1': (body) => ({ body: { ...BOOK, ...(body as object) } }),
    });
    expect(await screen.findByRole('header', { name: 'Modifier le livre' })).toBeTruthy();
    expect(await screen.findByDisplayValue('Le Nom du vent')).toBeTruthy();
    expect(screen.getByDisplayValue('662')).toBeTruthy();

    await type('Titre', 'Le Nom du vent (poche)');
    await type('Pages', '');
    await press('Enregistrer les modifications');

    await waitFor(() => expect(server.calls.some((c) => c.method === 'PATCH')).toBe(true));
    expect(server.calls.find((c) => c.method === 'PATCH')?.body).toEqual({
      isbn13: '9782352940159',
      title: 'Le Nom du vent (poche)',
      authors: ['Patrick Rothfuss'],
      genres: ['Fantasy'],
      publisher: 'Bragelonne',
      year: 2009,
      pages: null,
      description: null,
    });
    expect(await screen.findByText('Detail stub')).toBeTruthy();
  });

  it('deletes only after confirmation, then goes back to the library', async () => {
    const { server } = await renderAt('/book/edit/b1', {
      'GET /api/books/b1': { body: BOOK },
      'DELETE /api/books/b1': { status: 204 },
    });
    await screen.findByDisplayValue('Le Nom du vent');

    await press('Supprimer ce livre');
    expect(screen.getByText('Supprimer « Le Nom du vent » ?')).toBeTruthy();
    await press('Annuler');
    expect(screen.queryByText('Supprimer « Le Nom du vent » ?')).toBeNull();
    expect(server.calls.some((c) => c.method === 'DELETE')).toBe(false);

    await press('Supprimer ce livre');
    await press('Supprimer définitivement');

    expect(await screen.findByText('Library stub')).toBeTruthy();
    expect(screen).toHavePathname('/');
    expect(server.calls.filter((c) => c.method === 'DELETE')).toHaveLength(1);
  });

  it('offers a retry when the book cannot be loaded', async () => {
    await renderAt('/book/edit/b1', { 'GET /api/books/b1': 'offline' });
    expect(await screen.findByText('Impossible de joindre le serveur.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeTruthy();
  });
});
