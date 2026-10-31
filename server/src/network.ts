import { networkInterfaces } from 'node:os';

import { isLocalAddress } from './lan-only';

type Interfaces = ReturnType<typeof networkInterfaces>;

/** The `http://<ip>:<port>` URLs of this machine on the home network (private IPv4 only). */
export function lanUrls(port: number, interfaces: Interfaces = networkInterfaces()): string[] {
  return Object.values(interfaces)
    .flatMap((entries) => entries ?? [])
    .filter((entry) => entry.family === 'IPv4' && !entry.internal && isLocalAddress(entry.address))
    .map((entry) => `http://${entry.address}:${port}`);
}
