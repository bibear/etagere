import { networkInterfaces } from 'node:os';

import { isLocalAddress } from './lan-only';

type Interfaces = ReturnType<typeof networkInterfaces>;

// Virtual bridges of containers and VMs (Docker, Podman, libvirt, VMware, VirtualBox): phones
// cannot reach these addresses.
const BRIDGE = /^(docker\d*|br-|veth|virbr|vmnet|vboxnet|cni|podman|flannel)/i;
// VPN and overlay tunnels: maybe reachable, but rarely what a phone on the Wi-Fi should use.
const TUNNEL = /^(utun|tun|tap|wg|tailscale|zt|ppp|ipsec)/i;

/**
 * The `http://<ip>:<port>` URLs of this machine on the home network (private IPv4 only),
 * Wi-Fi / Ethernet first, tunnels last, container and VM bridges left out.
 */
export function lanUrls(port: number, interfaces: Interfaces = networkInterfaces()): string[] {
  return Object.entries(interfaces)
    .filter(([name]) => !BRIDGE.test(name))
    .sort(([a], [b]) => Number(TUNNEL.test(a)) - Number(TUNNEL.test(b)))
    .flatMap(([, entries]) => entries ?? [])
    .filter((entry) => entry.family === 'IPv4' && !entry.internal && isLocalAddress(entry.address))
    .map((entry) => `http://${entry.address}:${port}`);
}

/**
 * The URLs shown to phones (start-up banner, QR code, `/api/server-info`): ETAGERE_PUBLIC_URL
 * when set (Docker bridge mode, Docker Desktop, several interfaces), else the LAN addresses
 * (none when bound to loopback only).
 */
export function advertisedUrls(options: {
  port: number;
  publicUrl: string | null;
  loopbackOnly: boolean;
  interfaces?: Interfaces;
}): string[] {
  if (options.publicUrl) return [options.publicUrl];
  return options.loopbackOnly ? [] : lanUrls(options.port, options.interfaces);
}
