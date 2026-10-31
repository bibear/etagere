import Bonjour, { type ServiceConfig } from 'bonjour-service';
import QRCode from 'qrcode';

/** mDNS host name announced on the home network (`http://etagere.local:4848`). */
export const MDNS_HOST = 'etagere.local';
/** DNS-SD service type: `_etagere._tcp`. */
export const MDNS_SERVICE_TYPE = 'etagere';

interface Log {
  info(message: string): void;
  warn(message: string): void;
}

/** The part of `bonjour-service` the server uses (tests pass a fake). */
export interface MdnsPublisher {
  publish(config: ServiceConfig): {
    on(event: 'error', listener: (error: unknown) => void): unknown;
  };
  unpublishAll(callback?: () => void): void;
  destroy(callback?: () => void): void;
}

export interface AnnounceOptions {
  port: number;
  version: string;
  householdName: string;
  log: Log;
  /** Creates the mDNS responder; `onError` receives socket errors (port 5353 busy, no multicast). */
  createPublisher?: (onError: (error: unknown) => void) => MdnsPublisher;
}

const reason = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const defaultPublisher = (onError: (error: unknown) => void): MdnsPublisher =>
  new Bonjour({}, onError) as unknown as MdnsPublisher;

/**
 * Announces `_etagere._tcp` with the host name `etagere.local`. Best effort: a network without
 * multicast (or a Docker bridge) only loses the automatic discovery, never the server.
 * Returns a function that withdraws the announce.
 */
export function announce({
  port,
  version,
  householdName,
  log,
  createPublisher = defaultPublisher,
}: AnnounceOptions): () => Promise<void> {
  const warn = (error: unknown) =>
    log.warn(`mDNS announce unavailable (${reason(error)}); type the address in the app instead.`);
  let publisher: MdnsPublisher;
  try {
    publisher = createPublisher(warn);
    publisher
      .publish({
        name: householdName,
        type: MDNS_SERVICE_TYPE,
        protocol: 'tcp',
        port,
        host: MDNS_HOST,
        txt: { version, path: '/api' },
      })
      .on('error', warn);
  } catch (error) {
    warn(error);
    return async () => {};
  }
  log.info(`Announced on the home network as http://${MDNS_HOST}:${port}`);
  return () =>
    new Promise<void>((resolve) => {
      publisher.unpublishAll(() => publisher.destroy(() => resolve()));
    });
}

/**
 * The text printed at start: the addresses to open on a phone and a QR code of the main one
 * (scanned by the app's server settings, or by the phone camera to open the PWA).
 */
export async function pairingBanner(urls: string[], port: number, mdns: boolean): Promise<string> {
  const main = urls[0] ?? `http://localhost:${port}`;
  const addresses = [
    ...(urls.length > 0 ? urls : [main]),
    ...(mdns ? [`http://${MDNS_HOST}:${port}`] : []),
  ];
  const qr = await QRCode.toString(main, {
    type: 'terminal',
    small: true,
    errorCorrectionLevel: 'M',
  });
  return [
    '',
    'Étagère is ready. On a phone of the household, open:',
    ...addresses.map((url) => `  ${url}`),
    '',
    'Or scan this code with the Étagère app (Server settings > Scan the server code):',
    qr,
  ].join('\n');
}
