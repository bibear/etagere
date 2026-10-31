import type { FastifyInstance } from 'fastify';

/** Ping interval: drops connections of phones that left the Wi-Fi without closing. */
export const PING_INTERVAL_MS = 30_000;

// GET /api/events — WebSocket pushing `{ type, id? }` after every mutation (one JSON per message).
export async function eventRoutes(app: FastifyInstance): Promise<void> {
  app.get('/events', { websocket: true }, (socket) => {
    let alive = true;
    const unsubscribe = app.events.subscribe((event) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(event));
    });
    const ping = setInterval(() => {
      if (!alive) {
        socket.terminate();
        return;
      }
      alive = false;
      socket.ping();
    }, PING_INTERVAL_MS);
    ping.unref();
    socket.on('pong', () => {
      alive = true;
    });
    // The channel is one-way: anything the device sends is ignored.
    socket.on('close', () => {
      clearInterval(ping);
      unsubscribe();
    });
  });
}
