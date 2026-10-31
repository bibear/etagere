import type { ServerEvent } from '@etagere/shared';

/** The part of `WebSocket` used here (same on React Native and the web). */
export interface SocketLike {
  onopen: (() => void) | null;
  onmessage: ((message: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  close(): void;
}

export type CreateSocket = (url: string) => SocketLike;

export interface RealtimeOptions {
  /** `ws://<server>/api/events` (see `eventsUrl`). */
  url: string;
  onEvent: (event: ServerEvent) => void;
  /** Called when the connection comes back after a drop: events may have been missed. */
  onReconnect?: () => void;
  createSocket?: CreateSocket;
  /** Timers, injectable for tests. */
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  minDelayMs?: number;
  maxDelayMs?: number;
}

const EVENT_TYPES = new Set<string>(['books.changed', 'profiles.changed', 'comments.changed']);

/** Parses a message of the server; anything unexpected is ignored. */
export function parseServerEvent(data: unknown): ServerEvent | null {
  if (typeof data !== 'string') return null;
  try {
    const value = JSON.parse(data) as { type?: unknown; id?: unknown };
    if (typeof value?.type !== 'string' || !EVENT_TYPES.has(value.type)) return null;
    const type = value.type as ServerEvent['type'];
    return typeof value.id === 'string' ? { type, id: value.id } : { type };
  } catch {
    return null;
  }
}

/** `http://host:4848` → `ws://host:4848/api/events` (`https` → `wss`). */
export const eventsUrl = (serverUrl: string): string =>
  `${serverUrl.replace(/\/+$/, '').replace(/^http/i, 'ws')}/api/events`;

/**
 * A WebSocket to `/api/events` that reconnects after a drop with exponential backoff
 * (1 s, 2 s, 4 s… capped at 30 s; back to 1 s once connected).
 */
export class RealtimeConnection {
  private socket: SocketLike | null = null;
  private timer: unknown = null;
  private attempt = 0;
  private running = false;
  private opened = false;
  private readonly createSocket: CreateSocket;
  private readonly setTimer: NonNullable<RealtimeOptions['setTimer']>;
  private readonly clearTimer: NonNullable<RealtimeOptions['clearTimer']>;

  constructor(private readonly options: RealtimeOptions) {
    this.createSocket = options.createSocket ?? ((url) => new WebSocket(url) as SocketLike);
    this.setTimer = options.setTimer ?? ((callback, ms) => setTimeout(callback, ms));
    this.clearTimer =
      options.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.connect();
  }

  stop(): void {
    this.running = false;
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = null;
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
      try {
        socket.close();
      } catch {
        // Already closed.
      }
    }
  }

  /** Delay before the next reconnection attempt. */
  get nextDelayMs(): number {
    const min = this.options.minDelayMs ?? 1000;
    const max = this.options.maxDelayMs ?? 30_000;
    return Math.min(max, min * 2 ** this.attempt);
  }

  private connect(): void {
    let socket: SocketLike;
    try {
      socket = this.createSocket(this.options.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;
    socket.onopen = () => {
      const reconnected = this.opened;
      this.opened = true;
      this.attempt = 0;
      if (reconnected) this.options.onReconnect?.();
    };
    socket.onmessage = (message) => {
      const event = parseServerEvent(message.data);
      if (event) this.options.onEvent(event);
    };
    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.scheduleReconnect();
    };
    socket.onerror = () => {
      // A close always follows an error: reconnection happens there.
    };
  }

  private scheduleReconnect(): void {
    if (!this.running || this.timer !== null) return;
    const delay = this.nextDelayMs;
    this.attempt += 1;
    this.timer = this.setTimer(() => {
      this.timer = null;
      if (this.running) this.connect();
    }, delay);
  }
}
