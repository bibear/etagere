// Private network ranges: loopback, RFC 1918, link-local (IPv4 169.254/16, IPv6 fe80::/10),
// IPv6 unique-local (fc00::/7). IPv4-mapped IPv6 addresses are judged as IPv4.
const IPV4_PRIVATE: [number, number][] = [
  [ipv4ToNumber('10.0.0.0'), 8],
  [ipv4ToNumber('172.16.0.0'), 12],
  [ipv4ToNumber('192.168.0.0'), 16],
  [ipv4ToNumber('127.0.0.0'), 8],
  [ipv4ToNumber('169.254.0.0'), 16],
];

function ipv4ToNumber(address: string): number {
  return address.split('.').reduce((total, part) => total * 256 + Number(part), 0);
}

const isIpv4 = (address: string): boolean =>
  /^\d{1,3}(\.\d{1,3}){3}$/.test(address) && address.split('.').every((part) => Number(part) < 256);

function isLocalIpv4(address: string): boolean {
  const value = ipv4ToNumber(address);
  return IPV4_PRIVATE.some(([network, bits]) => {
    const size = 2 ** (32 - bits);
    return value >= network && value < network + size;
  });
}

function isLocalIpv6(address: string): boolean {
  if (address === '::1') return true;
  if (!address.includes(':')) return false;
  const first = parseInt(address.split(':')[0] || '0', 16);
  return (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80;
}

const IPV4_MAPPED = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/;

/** True when the address belongs to a private network (the home LAN). Zone ids are ignored. */
export function isLocalAddress(address: string): boolean {
  const normalized = address.toLowerCase().replace(/%.*$/, '');
  const candidate = IPV4_MAPPED.exec(normalized)?.[1] ?? normalized;
  return isIpv4(candidate) ? isLocalIpv4(candidate) : isLocalIpv6(candidate);
}

/** The host name of a `Host` header value (`name:port`, `[v6]:port`), lowercased, no port. */
function hostnameOf(host: string): string {
  const value = host.trim().toLowerCase();
  if (value.startsWith('[')) {
    const end = value.indexOf(']');
    return end === -1 ? '' : value.slice(1, end);
  }
  const colon = value.lastIndexOf(':');
  // More than one colon without brackets: a bare IPv6 address, no port to strip.
  const name = colon !== -1 && value.indexOf(':') === colon ? value.slice(0, colon) : value;
  return name.replace(/\.$/, '');
}

/**
 * True when a host name designates this server on the home network: a private IP literal,
 * `localhost`, a `*.local` mDNS name, or a name listed in `extraHosts` (ETAGERE_ALLOWED_HOSTS).
 * Any other name means a page reached us through DNS rebinding (D-03).
 */
function isHomeHostname(hostname: string, extraHosts: readonly string[]): boolean {
  if (hostname === '') return false;
  return (
    hostname === 'localhost' ||
    hostname.endsWith('.local') ||
    isLocalAddress(hostname) ||
    extraHosts.some((extra) => extra.trim().toLowerCase() === hostname)
  );
}

/** Allowed `Host` header (see `isHomeHostname`); a missing Host is refused. */
export function isAllowedHost(
  host: string | undefined,
  extraHosts: readonly string[] = [],
): boolean {
  return host !== undefined && isHomeHostname(hostnameOf(host), extraHosts);
}

/** Allowed CORS / WebSocket origin: `localhost` (Expo web dev server), `*.local`, a private address, or an extra host. */
export function isLocalOrigin(origin: string, extraHosts: readonly string[] = []): boolean {
  let hostname: string;
  try {
    hostname = new URL(origin).hostname;
  } catch {
    return false;
  }
  return isHomeHostname(hostname.toLowerCase().replace(/^\[|\]$/g, ''), extraHosts);
}
