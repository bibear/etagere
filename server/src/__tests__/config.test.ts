import { loadConfig } from '../config';
import { advertisedUrls, lanUrls } from '../network';

describe('loadConfig', () => {
  it('uses the defaults', () => {
    expect(loadConfig({}, '/home/me')).toEqual({
      port: 4848,
      host: '0.0.0.0',
      dataDir: '/home/me/etagere-data',
      householdName: 'Étagère',
      logLevel: 'info',
      mdns: true,
      publicDir: null,
      allowedHosts: [],
      publicUrl: null,
    });
  });

  it('reads ETAGERE_ALLOWED_HOSTS as a comma-separated list', () => {
    expect(
      loadConfig({ ETAGERE_ALLOWED_HOSTS: ' Etagere.home.arpa , ,nas.lan' }).allowedHosts,
    ).toEqual(['etagere.home.arpa', 'nas.lan']);
  });

  it('reads ETAGERE_PUBLIC_DIR against the working directory', () => {
    expect(loadConfig({ ETAGERE_PUBLIC_DIR: 'web' }, '/srv').publicDir).toBe('/srv/web');
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

  it.each(['0', 'false', 'OFF'])('turns mDNS off with ETAGERE_MDNS=%s', (value) => {
    expect(loadConfig({ ETAGERE_MDNS: value }).mdns).toBe(false);
  });

  it('reads ETAGERE_PUBLIC_URL and answers to its host name', () => {
    const config = loadConfig({ ETAGERE_PUBLIC_URL: ' http://NAS.home.arpa:4848/ ' });
    expect(config.publicUrl).toBe('http://nas.home.arpa:4848');
    expect(config.allowedHosts).toContain('nas.home.arpa');
  });

  it.each(['nas:4848', 'ftp://nas', 'http://'])('rejects ETAGERE_PUBLIC_URL=%s', (value) => {
    expect(() => loadConfig({ ETAGERE_PUBLIC_URL: value })).toThrow(/ETAGERE_PUBLIC_URL/);
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

const iface = (address: string, family: 'IPv4' | 'IPv6' = 'IPv4', internal = false) => ({
  address,
  family,
  internal,
  netmask: '',
  mac: '',
  cidr: null,
  ...(family === 'IPv6' ? { scopeid: 0 } : {}),
});
type Interfaces = Parameters<typeof lanUrls>[1];

describe('lanUrls ranking', () => {
  it('leaves container and VM bridges out and puts tunnels last', () => {
    const interfaces = {
      docker0: [iface('172.17.0.1')],
      'br-3f2a': [iface('172.18.0.1')],
      veth12ab: [iface('172.19.0.1')],
      utun3: [iface('10.8.0.2')],
      en0: [iface('192.168.1.20')],
    } as unknown as Interfaces;
    expect(lanUrls(4848, interfaces)).toEqual(['http://192.168.1.20:4848', 'http://10.8.0.2:4848']);
  });
});

describe('advertisedUrls', () => {
  const interfaces = { eth0: [iface('172.17.0.2')] } as unknown as Interfaces;

  it('advertises ETAGERE_PUBLIC_URL only (Docker bridge mode: the container address is useless)', () => {
    expect(
      advertisedUrls({
        port: 4848,
        publicUrl: 'http://192.168.1.20:4848',
        loopbackOnly: false,
        interfaces,
      }),
    ).toEqual(['http://192.168.1.20:4848']);
  });

  it('falls back to the LAN addresses, none when bound to loopback', () => {
    expect(
      advertisedUrls({ port: 4848, publicUrl: null, loopbackOnly: false, interfaces }),
    ).toEqual(['http://172.17.0.2:4848']);
    expect(advertisedUrls({ port: 4848, publicUrl: null, loopbackOnly: true, interfaces })).toEqual(
      [],
    );
  });
});
