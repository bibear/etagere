import type { BookCandidate, BookDetail } from '@etagere/shared';
import { QueryClient } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';
import { Linking, Text, View } from 'react-native';

import { AppProviders } from '../components/AppProviders';
import { ScanScreen } from '../scan/ScanScreen';
import type {
  CameraPermission,
  PhotoCaptureProps,
  ScannerBackend,
  ScannerCameraProps,
} from '../scan/types';
import { fakeFetch } from '../test/fakeFetch';
import { TEST_PROFILE, TEST_SERVER_URL } from '../test/render';

const ISBN = '9782352940159';

const CANDIDATE: BookCandidate = {
  isbn13: ISBN,
  title: 'Le Nom du vent',
  authors: ['Patrick Rothfuss'],
  genres: ['Fantasy'],
  publisher: 'Bragelonne',
  year: 2009,
  pages: 662,
  description: null,
  coverSourceUrl: null,
};

const BOOK: BookDetail = {
  id: 'b1',
  isbn13: ISBN,
  title: 'Le Nom du vent',
  authors: ['Patrick Rothfuss'],
  coverUrl: null,
  addedAt: '2026-10-31T10:00:00.000Z',
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

/** A scanner backend whose camera the test drives: `scan(code)` simulates a decoded barcode. */
function fakeScanner(permission: Partial<CameraPermission> = {}) {
  const camera = {
    props: null as ScannerCameraProps | null,
  };
  const request = jest.fn(async () => {});
  function Camera(props: ScannerCameraProps) {
    camera.props = props;
    return <View testID="fake-camera" />;
  }
  const backend: ScannerBackend = {
    Camera,
    hasTorch: true,
    useCameraPermission: () => ({ status: 'granted', canAskAgain: true, request, ...permission }),
  };
  const scan = (code: string) => act(() => camera.props?.onCode(code));
  return { backend, camera, request, scan };
}

/** The web fallback: no live camera (or one that fails), a photo button the test drives. */
function fakePhotoScanner({ live = false } = {}) {
  const base = fakeScanner();
  const photo = { props: null as PhotoCaptureProps | null };
  function PhotoCapture(props: PhotoCaptureProps) {
    photo.props = props;
    return <Text>Photo button</Text>;
  }
  const backend: ScannerBackend = {
    ...base.backend,
    Camera: live ? base.backend.Camera : null,
    PhotoCapture,
    hasTorch: false,
  };
  return {
    ...base,
    backend,
    photo,
    shoot: (code: string) => act(() => photo.props?.onCode(code)),
    miss: () => act(() => photo.props?.onNoBarcode()),
  };
}

async function renderScanner(
  routes: Parameters<typeof fakeFetch>[0],
  scanner = fakeScanner(),
  clock = { now: 0 },
) {
  const server = fakeFetch(routes);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  function NewBookStub() {
    const { isbn } = useLocalSearchParams<{ isbn?: string }>();
    return <Text>New book stub {isbn ?? 'none'}</Text>;
  }
  await renderRouter(
    {
      _layout: () => (
        <AppProviders
          locale="fr"
          scheme="light"
          queryClient={queryClient}
          fetch={server.fetch}
          session={{ profile: TEST_PROFILE, serverUrl: TEST_SERVER_URL }}
        >
          <Stack screenOptions={{ headerShown: false }} />
        </AppProviders>
      ),
      index: () => <Text>Library stub</Text>,
      scan: () => <ScanScreen backend={scanner.backend} now={() => clock.now} />,
      'book/[id]': () => <Text>Detail stub</Text>,
      'book/new': NewBookStub,
    },
    { initialUrl: '/scan' },
  );
  await screen.findByRole('header', { name: 'Scanner un livre' });
  return { server, ...scanner };
}

const press = (name: string | RegExp) => fireEvent.press(screen.getByRole('button', { name }));
const lookups = (server: ReturnType<typeof fakeFetch>) =>
  server.calls.filter((call) => call.path.startsWith('/api/lookup/'));

describe('scanner', () => {
  it('looks up a scanned ISBN, shows the candidate and adds it in one tap', async () => {
    const { server, camera, scan } = await renderScanner({
      [`GET /api/lookup/${ISBN}`]: { body: CANDIDATE },
      'POST /api/books': { status: 201, body: BOOK },
    });
    expect(screen.getByLabelText('Code-barres ISBN au dos du livre')).toBeTruthy();
    expect(camera.props?.active).toBe(true);

    await scan(ISBN);

    expect(await screen.findByText('Livre trouvé')).toBeTruthy();
    expect(screen.getByText('via Open Library · Google Books')).toBeTruthy();
    expect(screen.getByText('Le Nom du vent')).toBeTruthy();
    expect(screen.getByText('Patrick Rothfuss')).toBeTruthy();
    expect(screen.getByText('Fantasy · Bragelonne · 2009')).toBeTruthy();
    expect(camera.props?.active).toBe(false);

    await press('Ajouter à la bibliothèque');

    expect(await screen.findByText('Ajouté à la bibliothèque')).toBeTruthy();
    const post = server.calls.find((call) => call.method === 'POST');
    expect(post?.body).toEqual(CANDIDATE);
    expect(post?.headers['x-etagere-profile']).toBe(TEST_PROFILE.id);

    await press('Voir le livre');
    expect(await screen.findByText('Detail stub')).toBeTruthy();
    expect(screen).toHavePathname('/book/b1');
  });

  it('ignores barcodes that are not book ISBNs', async () => {
    const { server, scan } = await renderScanner({});

    await scan('4006381333931'); // an EAN-13 outside the 978/979 book range
    await scan('9782352940158'); // bad checksum

    expect(lookups(server)).toHaveLength(0);
    expect(screen.queryByText(/Recherche du livre/)).toBeNull();
  });

  it('"Scan another" resumes the camera and accepts the same book again', async () => {
    const { server, camera, scan } = await renderScanner({
      [`GET /api/lookup/${ISBN}`]: { body: CANDIDATE },
    });
    await scan(ISBN);
    await screen.findByText('Livre trouvé');

    await press('Scanner un autre');

    expect(screen.queryByText('Livre trouvé')).toBeNull();
    expect(camera.props?.active).toBe(true);
    await scan(ISBN);
    await screen.findByText('Livre trouvé');
    expect(lookups(server)).toHaveLength(2);
  });

  it('offers manual entry when Open Library does not know the ISBN', async () => {
    const { scan } = await renderScanner({
      [`GET /api/lookup/${ISBN}`]: { status: 404, body: { code: 'not_found' } },
    });
    await scan(ISBN);

    expect(await screen.findByText('Livre introuvable')).toBeTruthy();
    expect(screen.getByText(new RegExp(`l'ISBN ${ISBN}`))).toBeTruthy();

    await press('Saisir le livre à la main');
    expect(await screen.findByText(`New book stub ${ISBN}`)).toBeTruthy();
  });

  it('explains an Open Library outage and retries', async () => {
    const { server, scan } = await renderScanner({
      [`GET /api/lookup/${ISBN}`]: { status: 502, body: { code: 'upstream_unavailable' } },
    });
    await scan(ISBN);

    expect(
      await screen.findByText(
        'Les catalogues en ligne (Open Library, Google Books) ne répondent pas. Réessaie plus tard.',
      ),
    ).toBeTruthy();
    await press('Réessayer');
    await waitFor(() => expect(lookups(server)).toHaveLength(2));
  });

  it('looks up a typed ISBN (ISBN-10 accepted) and rejects an invalid one', async () => {
    const { server } = await renderScanner({
      [`GET /api/lookup/9782266111560`]: { body: { ...CANDIDATE, isbn13: '9782266111560' } },
    });

    await press("Saisir l'ISBN à la main");
    await fireEvent.changeText(screen.getByLabelText('ISBN du livre'), '1234');
    await press('Rechercher');
    expect(screen.getByText("Cet ISBN n'est pas valide.")).toBeTruthy();
    expect(lookups(server)).toHaveLength(0);

    await fireEvent.changeText(screen.getByLabelText('ISBN du livre'), '2-266-11156-6');
    await press('Rechercher');

    expect(await screen.findByText('Livre trouvé')).toBeTruthy();
    expect(lookups(server)[0]?.path).toBe('/api/lookup/9782266111560');
  });

  it('switches the torch', async () => {
    const { camera } = await renderScanner({});
    expect(camera.props?.torch).toBe(false);

    await press('Allumer la lampe');

    expect(camera.props?.torch).toBe(true);
    expect(screen.getByRole('button', { name: 'Éteindre la lampe' })).toBeTruthy();
  });

  it('opens the add form for a book without a barcode', async () => {
    await renderScanner({});
    await press('Ajouter un livre sans code-barres');
    expect(await screen.findByText('New book stub none')).toBeTruthy();
  });

  it('closes back to the library', async () => {
    await renderScanner({});
    await press('Fermer le scanner');
    expect(await screen.findByText('Library stub')).toBeTruthy();
  });
});

describe('scanner states', () => {
  it('shows the existing book when the scanned ISBN is already on the shelf', async () => {
    const { scan } = await renderScanner({
      [`GET /api/lookup/${ISBN}`]: {
        status: 409,
        body: { code: 'already_in_library', book: BOOK },
      },
    });
    await scan(ISBN);

    expect(await screen.findByText('Déjà dans la bibliothèque')).toBeTruthy();
    expect(screen.getByText('Le Nom du vent')).toBeTruthy();
    await press('Voir le livre');
    expect(await screen.findByText('Detail stub')).toBeTruthy();
  });

  it('handles a book added meanwhile by someone else', async () => {
    const { scan } = await renderScanner({
      [`GET /api/lookup/${ISBN}`]: { body: CANDIDATE },
      'POST /api/books': { status: 409, body: { code: 'already_in_library', book: BOOK } },
    });
    await scan(ISBN);
    await screen.findByText('Livre trouvé');
    await press('Ajouter à la bibliothèque');

    expect(await screen.findByText('Déjà dans la bibliothèque')).toBeTruthy();
  });

  it('asks for the camera once, then offers a button', async () => {
    const scanner = fakeScanner({ status: 'undetermined' });
    await renderScanner({}, scanner);

    expect(scanner.request).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('fake-camera')).toBeNull();
    expect(screen.getByRole('header', { name: 'Accès à la caméra' })).toBeTruthy();

    await press('Autoriser la caméra');
    expect(scanner.request).toHaveBeenCalledTimes(2);
  });

  it('sends to the settings when the camera was refused for good', async () => {
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    const scanner = fakeScanner({ status: 'denied', canAskAgain: false });
    await renderScanner({}, scanner);

    expect(scanner.request).not.toHaveBeenCalled();
    await press('Ouvrir les réglages');
    expect(openSettings).toHaveBeenCalled();
    // Typing the ISBN still works without the camera.
    expect(screen.getByRole('button', { name: "Saisir l'ISBN à la main" })).toBeTruthy();
    openSettings.mockRestore();
  });

  it('shows the permission panel when the camera reports a refusal', async () => {
    const scanner = fakeScanner();
    await renderScanner({}, scanner);

    await act(() => scanner.camera.props?.onError?.('denied'));

    expect(screen.getByRole('header', { name: 'Accès à la caméra' })).toBeTruthy();
    expect(screen.queryByTestId('fake-camera')).toBeNull();
  });
});

describe('photo fallback (PWA over plain HTTP)', () => {
  it('decodes a photo of the barcode instead of the live camera', async () => {
    const scanner = fakePhotoScanner();
    const { server } = await renderScanner(
      { [`GET /api/lookup/${ISBN}`]: { body: CANDIDATE } },
      scanner,
    );

    expect(screen.getByText(/Prends en photo le code-barres/)).toBeTruthy();
    expect(screen.getByText(/demande une connexion sécurisée/)).toBeTruthy();
    expect(screen.queryByTestId('fake-camera')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Allumer la lampe' })).toBeNull();
    expect(scanner.photo.props?.disabled).toBe(false);

    await scanner.shoot(ISBN);

    expect(await screen.findByText('Livre trouvé')).toBeTruthy();
    expect(lookups(server)).toHaveLength(1);
    expect(scanner.photo.props?.disabled).toBe(true);
  });

  it('says when the photo holds no book barcode', async () => {
    const scanner = fakePhotoScanner();
    const { server } = await renderScanner({}, scanner);

    await scanner.miss();
    expect(screen.getByText(/Aucun code-barres de livre lisible/)).toBeTruthy();

    await scanner.shoot('4006381333931');
    expect(screen.getByText(/Aucun code-barres de livre lisible/)).toBeTruthy();
    expect(lookups(server)).toHaveLength(0);
  });

  it('falls back to the photo when the live camera is unavailable', async () => {
    const scanner = fakePhotoScanner({ live: true });
    await renderScanner({}, scanner);
    expect(screen.getByTestId('fake-camera')).toBeTruthy();

    await act(() => scanner.camera.props?.onError?.('unavailable'));

    expect(screen.queryByTestId('fake-camera')).toBeNull();
    expect(screen.getByText('Prends en photo le code-barres au dos du livre.')).toBeTruthy();
    expect(screen.getByText('Photo button')).toBeTruthy();
  });

  it('keeps the photo button when the browser camera is refused', async () => {
    const scanner = fakePhotoScanner({ live: true });
    await renderScanner({}, scanner);

    await act(() => scanner.camera.props?.onError?.('denied'));

    expect(screen.getByRole('header', { name: 'Accès à la caméra' })).toBeTruthy();
    expect(screen.getByText('Photo button')).toBeTruthy();
  });
});
