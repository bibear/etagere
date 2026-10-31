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

/** Allowed CORS origin: `localhost` (Expo web dev server) or a private address. */
export function isLocalOrigin(origin: string): boolean {
  let hostname: string;
  try {
    hostname = new URL(origin).hostname;
  } catch {
    return false;
  }
  return (
    hostname === 'localhost' ||
    hostname.endsWith('.local') ||
    isLocalAddress(hostname.replace(/^\[|\]$/g, ''))
  );
}
