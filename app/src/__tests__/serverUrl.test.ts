import { defaultServerUrl, normalizeServerUrl } from '../session/serverUrl';

describe('defaultServerUrl', () => {
  const location = {
    origin: 'http://192.168.1.20:4848',
    hostname: '192.168.1.20',
    protocol: 'http:',
  };

  it('uses the page origin for the PWA served by the server', () => {
    expect(defaultServerUrl({ os: 'web', dev: false, location })).toBe('http://192.168.1.20:4848');
  });

  it('targets port 4848 of the same host in web development', () => {
    const dev = { origin: 'http://localhost:8081', hostname: 'localhost', protocol: 'http:' };
    expect(defaultServerUrl({ os: 'web', dev: true, location: dev })).toBe('http://localhost:4848');
  });

  it.each(['ios', 'android'])('uses etagere.local on %s', (os) => {
    expect(defaultServerUrl({ os, dev: false })).toBe('http://etagere.local:4848');
  });
});

describe('normalizeServerUrl', () => {
  it.each([
    ['192.168.1.20', 'http://192.168.1.20:4848'],
    [' 192.168.1.20:8080 ', 'http://192.168.1.20:8080'],
    ['http://etagere.local', 'http://etagere.local:4848'],
    ['http://etagere.local:4848/', 'http://etagere.local:4848'],
    ['https://books.example', 'https://books.example'],
  ])('%j → %s', (input, expected) => {
    expect(normalizeServerUrl(input)).toBe(expected);
  });

  it.each(['', '   ', 'http://', 'ht tp://x y'])('rejects %j', (input) => {
    expect(normalizeServerUrl(input)).toBeNull();
  });
});
