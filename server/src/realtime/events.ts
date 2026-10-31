import type { ServerEvent } from '@etagere/shared';

export type EventListener = (event: ServerEvent) => void;

/**
 * In-process publish/subscribe of the realtime events (docs/ARCHITECTURE.md § Realtime).
 * Routes publish after each committed mutation; the WebSocket route forwards to the devices.
 */
export class EventBus {
  private readonly listeners = new Set<EventListener>();

  publish(event: ServerEvent): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(event);
      } catch {
        // A failing subscriber (closed socket) never breaks the mutation that published.
      }
    }
  }

  /** Returns the unsubscribe function. */
  subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  get size(): number {
    return this.listeners.size;
  }
}
