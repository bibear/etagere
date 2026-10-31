import type { ServiceConfig } from 'bonjour-service';

import { type MdnsPublisher, announce, pairingBanner } from '../discovery';

function fakePublisher() {
  const published: ServiceConfig[] = [];
  const serviceListeners: Array<(error: unknown) => void> = [];
  let onError: (error: unknown) => void = () => {};
  const calls: string[] = [];
  const publisher: MdnsPublisher = {
    publish: (config) => {
      published.push(config);
      return {
        on: (_event: 'error', listener: (error: unknown) => void) =>
          serviceListeners.push(listener),
      };
    },
    unpublishAll: (callback) => {
      calls.push('unpublishAll');
      callback?.();
    },
    destroy: (callback) => {
      calls.push('destroy');
      callback?.();
    },
  };
  return {
    published,
    calls,
    failSocket: (error: unknown) => onError(error),
    failService: (error: unknown) => serviceListeners.forEach((listener) => listener(error)),
    create: (handler: (error: unknown) => void) => {
      onError = handler;
      return publisher;
    },
  };
}

const memoryLog = () => {
  const lines: string[] = [];
  return {
    lines,
    log: {
      info: (message: string) => lines.push(`info ${message}`),
      warn: (message: string) => lines.push(`warn ${message}`),
    },
  };
};

describe('announce', () => {
  it('publishes _etagere._tcp with the host name etagere.local', () => {
    const fake = fakePublisher();
    const { lines, log } = memoryLog();

    announce({
      port: 4848,
      version: '1.2.3',
      householdName: 'La maison',
      log,
      createPublisher: fake.create,
    });

    expect(fake.published).toEqual([
      {
        name: 'La maison',
        type: 'etagere',
        protocol: 'tcp',
        port: 4848,
        host: 'etagere.local',
        txt: { version: '1.2.3', path: '/api' },
      },
    ]);
    expect(lines).toContain('info Announced on the home network as http://etagere.local:4848');
  });

  it('withdraws the announce on stop', async () => {
    const fake = fakePublisher();
    const stop = announce({
      port: 4848,
      version: '1.0.0',
      householdName: 'Étagère',
      log: memoryLog().log,
      createPublisher: fake.create,
    });

    await stop();

    expect(fake.calls).toEqual(['unpublishAll', 'destroy']);
  });

  it('only warns when multicast is unavailable', () => {
    const fake = fakePublisher();
    const { lines, log } = memoryLog();
    announce({
      port: 4848,
      version: '1.0.0',
      householdName: 'Étagère',
      log,
      createPublisher: fake.create,
    });

    fake.failSocket(new Error('bind EADDRINUSE 0.0.0.0:5353'));
    fake.failService(new Error('Service name is already in use on the network'));

    expect(lines.filter((line) => line.startsWith('warn'))).toEqual([
      'warn mDNS announce unavailable (bind EADDRINUSE 0.0.0.0:5353); type the address in the app instead.',
      'warn mDNS announce unavailable (Service name is already in use on the network); type the address in the app instead.',
    ]);
  });

  it('keeps the server running when the responder cannot even start', async () => {
    const { lines, log } = memoryLog();
    const stop = announce({
      port: 4848,
      version: '1.0.0',
      householdName: 'Étagère',
      log,
      createPublisher: () => {
        throw new Error('no network interface');
      },
    });

    await expect(stop()).resolves.toBeUndefined();
    expect(lines).toEqual([
      'warn mDNS announce unavailable (no network interface); type the address in the app instead.',
    ]);
  });
});

describe('pairingBanner', () => {
  it('lists the LAN addresses, etagere.local and draws a QR code', async () => {
    const banner = await pairingBanner(
      ['http://192.168.1.20:4848', 'http://10.0.0.5:4848'],
      4848,
      true,
    );

    expect(banner).toContain(
      '  http://192.168.1.20:4848\n  http://10.0.0.5:4848\n  http://etagere.local:4848',
    );
    // Half-block characters of a small terminal QR code.
    expect(banner).toMatch(/[▀▄█]/);
  });

  it('encodes the first LAN address in the QR code', async () => {
    const qrcode = await import('qrcode');
    const expected = await qrcode.toString('http://192.168.1.20:4848', {
      type: 'terminal',
      small: true,
      errorCorrectionLevel: 'M',
    });

    const banner = await pairingBanner(['http://192.168.1.20:4848'], 4848, false);

    expect(banner).toContain(expected);
    expect(banner).not.toContain('etagere.local');
  });

  it('falls back to localhost without a LAN address', async () => {
    const banner = await pairingBanner([], 8080, false);

    expect(banner).toContain('  http://localhost:8080\n');
  });
});
