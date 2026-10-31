import type { ServerCodeScannerProps } from './ServerCodeScanner';

/** The PWA talks to the server that served it: nothing to pair. */
export const canScanServerCode = false;

export function ServerCodeScanner(_props: ServerCodeScannerProps) {
  return null;
}
