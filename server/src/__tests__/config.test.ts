import { loadConfig } from '../config';
import { lanUrls } from '../network';

describe('loadConfig', () => {
  it('uses the defaults', () => {
    expect(loadConfig({}, '/home/me')).toEqual({
      port: 4848,
      host: '0.0.0.0',
      dataDir: '/home/me/etagere-data',
      householdName: 'Étagère',
      logLevel: 'info',
    });
  });

  it('reads PORT, HOST, ETAGERE_DATA_DIR and ETAGERE_HOUSEHOLD_NAME', () => {
    const config = loadConfig(
      {
        PORT: '8080',
        HOST: '127.0.0.1',
        ETAGERE_DATA_DIR: '/data',
        ETAGERE_HOUSEHOLD_NAME: ' Maison ',
      },
      '/home/me',
    );
    expect(config).toMatchObject({
      port: 8080,
      host: '127.0.0.1',
      dataDir: '/data',
      householdName: 'Maison',
    });
  });

  it('resolves a relative data dir against the working directory', () => {
    expect(loadConfig({ ETAGERE_DATA_DIR: 'lib' }, '/srv').dataDir).toBe('/srv/lib');
  });

  it.each(['abc', '0', '65536', '1.5'])('rejects PORT=%s', (port) => {
    expect(() => loadConfig({ PORT: port })).toThrow(/PORT/);
  });
});

describe('lanUrls', () => {
  it('lists private IPv4 addresses of external interfaces', () => {
    const iface = (address: string, family: 'IPv4' | 'IPv6', internal = false) => ({
      address,
      family,
      internal,
      netmask: '',
      mac: '',
      cidr: null,
      ...(family === 'IPv6' ? { scopeid: 0 } : {}),
    });
    const interfaces = {
      lo0: [iface('127.0.0.1', 'IPv4', true)],
      en0: [iface('192.168.1.20', 'IPv4'), iface('fe80::1', 'IPv6')],
      utun: [iface('100.64.0.1', 'IPv4')],
      none: undefined,
    } as unknown as Parameters<typeof lanUrls>[1];
    expect(lanUrls(4848, interfaces)).toEqual(['http://192.168.1.20:4848']);
  });
});
