import { isIsbnBarcode } from '@etagere/shared';

/**
 * Filters the stream of barcodes a camera reports (several per second while a code is in view):
 * keeps book ISBNs (EAN-13 978/979 with a valid checksum) and drops a code seen again within
 * `cooldownMs`, so one book triggers one lookup.
 */
export function createScanGate({
  now = () => Date.now(),
  cooldownMs = 3000,
}: { now?: () => number; cooldownMs?: number } = {}) {
  let last: { code: string; at: number } | null = null;
  return {
    /** The ISBN-13 to look up, or null when the code must be ignored. */
    accept(payload: string): string | null {
      const code = payload.trim();
      if (!isIsbnBarcode(code)) return null;
      const at = now();
      if (last && last.code === code && at - last.at < cooldownMs) return null;
      last = { code, at };
      return code;
    },
    /** Forgets the last code ("Scan another" may scan the same book again). */
    reset() {
      last = null;
    },
  };
}
