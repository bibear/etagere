import { QueryClient } from '@tanstack/react-query';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Slot } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';

import OnboardingScreen from '../../app/onboarding';
import ServerSettingsScreen from '../../app/server';
import { AppProviders } from '../components/AppProviders';
import { discoverServer, serverUrlFromCode } from '../pairing/discovery';
import type { DeviceProfile, KeyValueStorage } from '../session/SessionProvider';
import { SESSION_STORAGE_KEY } from '../session/constants';
import { TEST_PROFILE } from '../test/render';

const mockPermission = { granted: true, canAskAgain: true };
const mockRequestPermission = jest.fn();
jest.mock('expo-camera', () => {
  const { View } = jest.requireActual('react-native');
  return {
    CameraView: (props: object) => <View {...props} />,
    useCameraPermissions: () => [mockPermission, mockRequestPermission],
  };
});

const DEFAULT = 'http://etagere.local:4848';
const SERVER_INFO = { version: '0.4.0', bookCount: 12, profileCount: 2, urls: [] };
const HEALTH = { status: 'ok', name: 'Étagère', version: '0.4.0', householdName: 'La maison' };

/** A network where only the given origins answer. */
function homeNetwork(online: string[]) {
  const calls: string[] = [];
  const fetchImpl = async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    calls.push(url.toString());
    if (!online.includes(url.origin)) throw new TypeError('Network request failed');
    const body = url.pathname === '/api/health' ? HEALTH : SERVER_INFO;
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  return { fetch: fetchImpl as typeof fetch, calls };
}

function memoryStorage(initial: Record<string, string> = {}) {
  const data: Record<string, string> = { ...initial };
  const storage: KeyValueStorage = {
    getItem: async (key) => data[key] ?? null,
    setItem: async (key, value) => {
      data[key] = value;
    },
    removeItem: async (key) => {
      delete data[key];
    },
  };
  return { storage, data };
}

async function renderApp(
  network: ReturnType<typeof homeNetwork>,
  {
    profile = null,
    savedUrl = null,
    initialUrl = '/onboarding',
  }: { profile?: DeviceProfile | null; savedUrl?: string | null; initialUrl?: string } = {},
) {
  const { storage, data } = memoryStorage();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  await renderRouter(
    {
      _layout: () => (
        <AppProviders
          locale="en"
          scheme="light"
          fetch={network.fetch}
          storage={storage}
          queryClient={queryClient}
          session={{ profile, serverUrl: savedUrl }}
          defaultUrl={DEFAULT}
        >
          <Slot />
        </AppProviders>
      ),
      index: () => null,
      onboarding: OnboardingScreen,
      server: ServerSettingsScreen,
    },
    { initialUrl },
  );
  return { data };
}

describe('discoverServer', () => {
  it('returns the first candidate that answers, in order', async () => {
    const probe = jest.fn(async (url: string) => {
      if (url !== 'http://b') throw new Error('offline');
      return 'info';
    });

    await expect(discoverServer(['http://a', 'http://b', 'http://c'], probe)).resolves.toEqual({
      url: 'http://b',
      result: 'info',
    });
    expect(probe.mock.calls.map(([url]) => url)).toEqual(['http://a', 'http://b']);
  });

  it('tries a repeated candidate once and rejects with the last failure', async () => {
    const probe = jest.fn(async () => {
      throw new Error('offline');
    });

    await expect(discoverServer(['http://a', 'http://a'], probe)).rejects.toThrow('offline');
    expect(probe).toHaveBeenCalledTimes(1);
  });
});

describe('serverUrlFromCode', () => {
  it.each([
    ['http://192.168.1.20:4848', 'http://192.168.1.20:4848'],
    [' http://192.168.1.20:4848/ ', 'http://192.168.1.20:4848'],
    ['http://etagere.local', 'http://etagere.local:4848'],
  ])('reads %s as %s', (data, url) => {
    expect(serverUrlFromCode(data)).toBe(url);
  });

  it.each(['9782352940159', 'WIFI:S:home;T:WPA;P:secret;;', 'etagere.local', 'http://'])(
    'rejects %s',
    (data) => {
      expect(serverUrlFromCode(data)).toBeNull();
    },
  );
});

describe('discovery at first launch', () => {
  it('uses the saved address when it answers', async () => {
    const network = homeNetwork(['http://192.168.1.20:4848']);
    await renderApp(network, { savedUrl: 'http://192.168.1.20:4848' });

    expect(await screen.findByText('192.168.1.20 · 12 books · 2 members')).toBeTruthy();
    expect(network.calls).toEqual(['http://192.168.1.20:4848/api/server-info']);
  });

  it('falls back to etagere.local when the saved address no longer answers', async () => {
    const network = homeNetwork([DEFAULT]);
    const { data } = await renderApp(network, { savedUrl: 'http://192.168.1.20:4848' });

    expect(await screen.findByText('etagere.local · 12 books · 2 members')).toBeTruthy();
    expect(network.calls.slice(0, 2)).toEqual([
      'http://192.168.1.20:4848/api/server-info',
      `${DEFAULT}/api/server-info`,
    ]);
    // The dead address is forgotten: the app follows etagere.local from now on.
    expect(JSON.parse(data[SESSION_STORAGE_KEY] ?? '{}')).toMatchObject({ serverUrl: null });
  });

  it('offers the server settings when nothing answers', async () => {
    await renderApp(homeNetwork([]), { savedUrl: 'http://192.168.1.20:4848' });

    expect(await screen.findByText('No library found')).toBeTruthy();
    await fireEvent.press(screen.getByText('Type the server address'));
    expect(await screen.findByRole('button', { name: 'Scan the server code' })).toBeTruthy();
  });
});

describe('pairing with the server QR code', () => {
  it('saves the address read from the code once it answers', async () => {
    const network = homeNetwork(['http://192.168.1.20:4848']);
    const { data } = await renderApp(network, { profile: TEST_PROFILE, initialUrl: '/server' });

    await fireEvent.press(await screen.findByRole('button', { name: 'Scan the server code' }));
    const camera = screen.getByTestId('server-code-camera');
    expect(camera.props.barcodeScannerSettings).toEqual({ barcodeTypes: ['qr'] });
    await fireEvent(camera, 'onBarcodeScanned', { type: 'qr', data: 'http://192.168.1.20:4848' });

    await waitFor(() =>
      expect(JSON.parse(data[SESSION_STORAGE_KEY] ?? '{}')).toMatchObject({
        serverUrl: 'http://192.168.1.20:4848',
      }),
    );
    expect(network.calls).toContain('http://192.168.1.20:4848/api/health');
  });

  it('explains when the code is not a server address', async () => {
    const network = homeNetwork([]);
    const { data } = await renderApp(network, { profile: TEST_PROFILE, initialUrl: '/server' });

    await fireEvent.press(await screen.findByRole('button', { name: 'Scan the server code' }));
    await fireEvent(screen.getByTestId('server-code-camera'), 'onBarcodeScanned', {
      type: 'qr',
      data: 'WIFI:S:home;T:WPA;P:secret;;',
    });

    expect(await screen.findByText('This code is not an Étagère server address.')).toBeTruthy();
    expect(network.calls).toEqual([]);
    expect(data[SESSION_STORAGE_KEY]).toBeUndefined();
  });

  it('does not save a scanned address that does not answer', async () => {
    const network = homeNetwork([]);
    const { data } = await renderApp(network, { profile: TEST_PROFILE, initialUrl: '/server' });

    await fireEvent.press(await screen.findByRole('button', { name: 'Scan the server code' }));
    await fireEvent(screen.getByTestId('server-code-camera'), 'onBarcodeScanned', {
      type: 'qr',
      data: 'http://10.0.0.9:4848',
    });

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByLabelText('Address').props.value).toBe('http://10.0.0.9:4848');
    expect(data[SESSION_STORAGE_KEY]).toBeUndefined();
  });

  it('asks for the camera before scanning', async () => {
    mockPermission.granted = false;
    try {
      await renderApp(homeNetwork([]), { profile: TEST_PROFILE, initialUrl: '/server' });

      await fireEvent.press(await screen.findByRole('button', { name: 'Scan the server code' }));
      expect(screen.getByText('Étagère needs the camera to read the server code.')).toBeTruthy();
      await fireEvent.press(screen.getByRole('button', { name: 'Allow the camera' }));
      expect(mockRequestPermission).toHaveBeenCalled();
      expect(screen.queryByTestId('server-code-camera')).toBeNull();
    } finally {
      mockPermission.granted = true;
    }
  });
});
