import type { ServerEvent } from '@etagere/shared';
import type { WebSocket } from 'ws';

import { type TestApp, buildTestApp } from './support/test-app';

describe('GET /api/events (realtime)', () => {
  let t: TestApp;
  let sockets: WebSocket[];

  beforeEach(async () => {
    t = buildTestApp();
    sockets = [];
    await t.app.ready();
  });
  afterEach(async () => {
    for (const socket of sockets) socket.terminate();
    await t.close();
  });

  const connect = async (): Promise<{ socket: WebSocket; received: ServerEvent[] }> => {
    // injectWS has no socket address nor Host by default: a phone on the home Wi-Fi.
    const socket = await t.app.injectWS('/api/events', {
      socket: { remoteAddress: '192.168.1.42' },
      headers: { host: '192.168.1.20:4848' },
    } as never);
    sockets.push(socket);
    const received: ServerEvent[] = [];
    socket.on('message', (data) => received.push(JSON.parse(String(data))));
    return { socket, received };
  };

  const until = async (check: () => boolean) => {
    for (let i = 0; i < 100 && !check(); i++) await new Promise((r) => setTimeout(r, 5));
    expect(check()).toBe(true);
  };

  const as = (profile: string) => ({ 'x-etagere-profile': profile });

  it('pushes an event to every connected device after each mutation', async () => {
    const me = t.seedProfile();
    const a = await connect();
    const b = await connect();

    const created = await t.app.inject({
      method: 'POST',
      url: '/api/books',
      headers: as(me),
      payload: { title: 'Dune', authors: [] },
    });
    const bookId = created.json().id;
    await t.app.inject({
      method: 'POST',
      url: `/api/books/${bookId}/reading/start`,
      headers: as(me),
    });
    await t.app.inject({
      method: 'POST',
      url: `/api/books/${bookId}/comments`,
      headers: as(me),
      payload: { text: 'Génial' },
    });
    await t.app.inject({
      method: 'PUT',
      url: `/api/profiles/${me}`,
      headers: as(me),
      payload: { name: 'Bruno', color: '#2C4A6B' },
    });

    const expected: ServerEvent[] = [
      { type: 'books.changed', id: bookId },
      { type: 'books.changed', id: bookId },
      { type: 'comments.changed', id: bookId },
      { type: 'profiles.changed', id: me },
    ];
    await until(() => a.received.length === 4 && b.received.length === 4);
    expect(a.received).toEqual(expected);
    expect(b.received).toEqual(expected);
  });

  it('does not push for reads or refused mutations', async () => {
    const { received } = await connect();
    await t.app.inject({ method: 'GET', url: '/api/books' });
    await t.app.inject({ method: 'POST', url: '/api/books', payload: { title: 'X', authors: [] } });
    await new Promise((r) => setTimeout(r, 20));
    expect(received).toEqual([]);
  });

  it('forgets a device when its socket closes', async () => {
    const { socket } = await connect();
    expect(t.app.events.size).toBe(1);
    socket.terminate();
    await until(() => t.app.events.size === 0);
  });

  it('is guarded like the rest of the API: devices outside the LAN are refused', async () => {
    const response = await t.app.inject({
      method: 'GET',
      url: '/api/events',
      remoteAddress: '8.8.8.8',
      headers: { connection: 'upgrade', upgrade: 'websocket' },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ code: 'outside_lan' });
  });
});
