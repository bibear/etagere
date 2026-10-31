import { isAllowedHost, isLocalAddress, isLocalOrigin } from '../lan-only';
import { type TestApp, buildTestApp } from './support/test-app';

describe('isLocalAddress', () => {
  it.each([
    '127.0.0.1',
    '127.255.255.255',
    '::1',
    '10.0.0.0',
    '10.255.255.255',
    '172.16.0.0',
    '172.31.255.255',
    '192.168.0.0',
    '192.168.255.255',
    '169.254.0.1',
    'fc00::1',
    'fdff:ffff::1',
    'fe80::1',
    'fe80::1%en0',
    'febf::1',
    '::ffff:192.168.1.10',
    '::FFFF:127.0.0.1',
  ])('accepts %s', (address) => {
    expect(isLocalAddress(address)).toBe(true);
  });

  it.each([
    '8.8.8.8',
    '172.15.255.255',
    '172.32.0.0',
    '192.169.0.1',
    '11.0.0.1',
    '169.255.0.1',
    '2001:db8::1',
    '2606:4700::1111',
    'fec0::1',
    '::ffff:8.8.8.8',
    '999.168.1.1',
    'not-an-ip',
    '',
  ])('refuses %s', (address) => {
    expect(isLocalAddress(address)).toBe(false);
  });
});

describe('isLocalOrigin', () => {
  it.each([
    ['http://192.168.1.33:8081', true],
    ['http://localhost:8081', true],
    ['http://etagere.local:4848', true],
    ['http://[fe80::1]:8081', true],
    ['https://example.com', false],
    ['http://8.8.8.8', false],
    ['not an origin', false],
  ])('%s → %s', (origin, expected) => {
    expect(isLocalOrigin(origin)).toBe(expected);
  });
});

describe('isAllowedHost', () => {
  it.each([
    'localhost',
    'localhost:4848',
    '192.168.1.20:4848',
    '10.0.0.5',
    '[fe80::1]:4848',
    '[::1]',
    'etagere.local:4848',
    'ETAGERE.LOCAL.',
  ])('accepts %s', (host) => {
    expect(isAllowedHost(host)).toBe(true);
  });

  it.each([
    'attacker.example:4999',
    'attacker.example',
    '8.8.8.8:4848',
    'localhost.attacker.example',
    'local',
    '[2606:4700::1111]:80',
    '[fe80::1',
    '',
    undefined,
  ])('refuses %s', (host) => {
    expect(isAllowedHost(host)).toBe(false);
  });

  it('accepts the extra names of ETAGERE_ALLOWED_HOSTS', () => {
    expect(isAllowedHost('Etagere.Home.Arpa:4848', ['etagere.home.arpa'])).toBe(true);
    expect(isAllowedHost('other.home.arpa:4848', ['etagere.home.arpa'])).toBe(false);
  });
});

describe('LAN-only guard', () => {
  let t: TestApp;

  beforeEach(() => {
    t = buildTestApp();
  });

  afterEach(() => t.close());

  it.each(['8.8.8.8', '2606:4700::1111'])('answers 403 outside_lan to %s', async (address) => {
    const response = await t.app.inject({
      method: 'GET',
      url: '/api/health',
      remoteAddress: address,
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ code: 'outside_lan' });
  });

  it('answers 403 outside_lan to a public host name (DNS rebinding)', async () => {
    t.seedProfile();
    const response = await t.app.inject({
      method: 'GET',
      url: '/api/profiles',
      remoteAddress: '192.168.1.42',
      headers: { host: 'attacker.example:4999' },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ code: 'outside_lan' });
  });

  it.each(['192.168.1.20:4848', 'etagere.local:4848', 'localhost:4848'])(
    'serves the home host name %s',
    async (host) => {
      const response = await t.app.inject({
        method: 'GET',
        url: '/api/health',
        remoteAddress: '192.168.1.42',
        headers: { host },
      });
      expect(response.statusCode).toBe(200);
    },
  );

  it('serves a host name listed in allowedHosts', async () => {
    const custom = buildTestApp({ allowedHosts: ['etagere.home.arpa'] });
    try {
      const response = await custom.app.inject({
        method: 'GET',
        url: '/api/health',
        remoteAddress: '192.168.1.42',
        headers: { host: 'etagere.home.arpa:4848', origin: 'http://etagere.home.arpa:4848' },
      });
      expect(response.statusCode).toBe(200);
      expect(response.headers['access-control-allow-origin']).toBe('http://etagere.home.arpa:4848');
    } finally {
      await custom.close();
    }
  });

  it('serves a client of the home network', async () => {
    const response = await t.app.inject({
      method: 'GET',
      url: '/api/health',
      remoteAddress: '192.168.1.42',
    });
    expect(response.statusCode).toBe(200);
  });

  it.each([
    ['http://192.168.1.33:8081', true],
    ['https://example.com', false],
  ])('CORS: origin %s allowed: %s', async (origin, allowed) => {
    const response = await t.app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { origin },
    });
    expect(response.headers['access-control-allow-origin']).toBe(allowed ? origin : undefined);
  });

  it.each(['PUT', 'PATCH', 'DELETE'])(
    'CORS: the web dev app may send %s with the profile header',
    async (method) => {
      const response = await t.app.inject({
        method: 'OPTIONS',
        url: '/api/profiles/3b241101-e2bb-4255-8caf-4136c566a962',
        headers: {
          origin: 'http://localhost:8081',
          'access-control-request-method': method,
          'access-control-request-headers': 'content-type,x-etagere-profile',
        },
      });
      expect(response.statusCode).toBe(204);
      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:8081');
      expect(String(response.headers['access-control-allow-methods']).split(/,\s*/)).toContain(
        method,
      );
      const headers = String(response.headers['access-control-allow-headers']).toLowerCase();
      expect(headers).toContain('x-etagere-profile');
      expect(headers).toContain('content-type');
    },
  );
});
