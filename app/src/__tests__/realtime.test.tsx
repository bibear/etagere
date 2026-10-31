import { QueryClient } from '@tanstack/react-query';
import { act, waitFor } from '@testing-library/react-native';

import {
  type CreateSocket,
  Realtime,
  RealtimeConnection,
  type SocketLike,
  eventsUrl,
  parseServerEvent,
  staleKeysFor,
} from '../realtime';
import { renderWithProviders } from '../test/render';

class FakeSocket implements SocketLike {
  onopen: (() => void) | null = null;
  onmessage: ((message: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(readonly url: string) {}
  close() {
    this.closed = true;
  }
  open() {
    this.onopen?.();
  }
  drop() {
    this.onerror?.();
    this.onclose?.();
  }
  send(event: unknown) {
    this.onmessage?.({ data: typeof event === 'string' ? event : JSON.stringify(event) });
  }
}

function fakeSockets() {
  const sockets: FakeSocket[] = [];
  const createSocket: CreateSocket = (url) => {
    const socket = new FakeSocket(url);
    sockets.push(socket);
    return socket;
  };
  return { sockets, createSocket, last: () => sockets[sockets.length - 1] as FakeSocket };
}

/** Manual timers: records delays, fires them on demand. */
function manualTimers() {
  const pending: { callback: () => void; ms: number; cancelled: boolean }[] = [];
  return {
    delays: () => pending.map((timer) => timer.ms),
    setTimer: (callback: () => void, ms: number) => {
      const timer = { callback, ms, cancelled: false };
      pending.push(timer);
      return timer;
    },
    clearTimer: (handle: unknown) => {
      (handle as { cancelled: boolean }).cancelled = true;
    },
    fireLast: () => {
      const timer = pending[pending.length - 1];
      if (timer && !timer.cancelled) timer.callback();
    },
    active: () => pending.filter((timer) => !timer.cancelled).length,
  };
}

describe('realtime events', () => {
  describe('parsing', () => {
    it('builds the events URL from the server address', () => {
      expect(eventsUrl('http://192.168.1.20:4848')).toBe('ws://192.168.1.20:4848/api/events');
      expect(eventsUrl('https://etagere.example/')).toBe('wss://etagere.example/api/events');
    });

    it('accepts known events only', () => {
      expect(parseServerEvent('{"type":"books.changed","id":"b1"}')).toEqual({
        type: 'books.changed',
        id: 'b1',
      });
      expect(parseServerEvent('{"type":"profiles.changed"}')).toEqual({
        type: 'profiles.changed',
      });
      expect(parseServerEvent('{"type":"hello"}')).toBeNull();
      expect(parseServerEvent('not json')).toBeNull();
      expect(parseServerEvent(42)).toBeNull();
    });
  });

  describe('connection', () => {
    it('forwards events and reconnects with exponential backoff, capped, reset on success', () => {
      const { sockets, createSocket, last } = fakeSockets();
      const timers = manualTimers();
      const events: unknown[] = [];
      const onReconnect = jest.fn();
      const connection = new RealtimeConnection({
        url: 'ws://h/api/events',
        onEvent: (event) => events.push(event),
        onReconnect,
        createSocket,
        setTimer: timers.setTimer,
        clearTimer: timers.clearTimer,
        minDelayMs: 1000,
        maxDelayMs: 8000,
      });

      connection.start();
      last().open();
      last().send({ type: 'books.changed', id: 'b1' });
      expect(events).toEqual([{ type: 'books.changed', id: 'b1' }]);
      expect(onReconnect).not.toHaveBeenCalled();

      // The server goes away: 1 s, 2 s, 4 s, 8 s, 8 s…
      for (let i = 0; i < 5; i++) {
        last().drop();
        timers.fireLast();
      }
      expect(timers.delays()).toEqual([1000, 2000, 4000, 8000, 8000]);
      expect(sockets).toHaveLength(6);

      // Back: missed events → full refresh, and the backoff starts over.
      last().open();
      expect(onReconnect).toHaveBeenCalledTimes(1);
      last().drop();
      expect(timers.delays().at(-1)).toBe(1000);
      connection.stop();
    });

    it('stops for good: closes the socket and cancels the pending retry', () => {
      const { sockets, createSocket, last } = fakeSockets();
      const timers = manualTimers();
      const connection = new RealtimeConnection({
        url: 'ws://h/api/events',
        onEvent: () => {},
        createSocket,
        setTimer: timers.setTimer,
        clearTimer: timers.clearTimer,
      });
      connection.start();
      last().drop();
      expect(timers.active()).toBe(1);
      connection.stop();
      expect(timers.active()).toBe(0);

      connection.start();
      const socket = last();
      connection.stop();
      expect(socket.closed).toBe(true);
      socket.onclose?.();
      expect(sockets).toHaveLength(2);
      expect(timers.active()).toBe(0);
    });

    it('retries when the socket cannot even be created', () => {
      const timers = manualTimers();
      const connection = new RealtimeConnection({
        url: 'ws://h/api/events',
        onEvent: () => {},
        createSocket: () => {
          throw new Error('bad url');
        },
        setTimer: timers.setTimer,
        clearTimer: timers.clearTimer,
      });
      connection.start();
      expect(timers.delays()).toEqual([1000]);
      connection.stop();
    });
  });

  describe('stale queries', () => {
    it('maps each event to the query prefixes it makes stale', () => {
      expect(staleKeysFor({ type: 'books.changed', id: 'b1' })).toEqual([
        ['books'],
        ['me'],
        ['server-info'],
      ]);
      expect(staleKeysFor({ type: 'comments.changed', id: 'b1' })).toEqual([
        ['comments', 'b1'],
        ['books', 'detail', 'b1'],
        ['me'],
      ]);
      expect(staleKeysFor({ type: 'profiles.changed', id: 'p1' })).toEqual([
        ['profiles'],
        ['books'],
        ['comments'],
        ['me'],
        ['server-info'],
      ]);
    });
  });

  describe('<Realtime />', () => {
    const newClient = () =>
      new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });

    it('connects to the server events and invalidates queries on each event', async () => {
      const { createSocket, last, sockets } = fakeSockets();
      const queryClient = newClient();
      const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

      const view = await renderWithProviders(<Realtime createSocket={createSocket} />, {
        queryClient,
      });

      await waitFor(() => expect(sockets).toHaveLength(1));
      expect(last().url).toBe('ws://etagere.test:4848/api/events');
      await act(async () => {
        last().open();
        last().send({ type: 'books.changed', id: 'b1' });
      });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['books'] });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['me'] });

      const socket = last();
      await view.unmount();
      expect(socket.closed).toBe(true);
    });

    it('refreshes everything after a reconnection', async () => {
      const { createSocket, last, sockets } = fakeSockets();
      const queryClient = newClient();
      const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
      const view = await renderWithProviders(
        <Realtime createSocket={createSocket} minDelayMs={1} maxDelayMs={1} />,
        { queryClient },
      );
      await waitFor(() => expect(sockets).toHaveLength(1));
      await act(async () => {
        last().open();
        last().drop();
      });
      await waitFor(() => expect(sockets).toHaveLength(2));
      await act(async () => last().open());
      expect(invalidate).toHaveBeenCalledWith();
      await view.unmount();
    });

    it('stays offline while the device has no profile', async () => {
      const { createSocket, sockets } = fakeSockets();
      await renderWithProviders(<Realtime createSocket={createSocket} />, { profile: null });
      await act(async () => {});
      expect(sockets).toHaveLength(0);
    });
  });
});
