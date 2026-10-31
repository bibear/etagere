import { getRandomBytes } from 'expo-crypto';

/**
 * Formats 16 random bytes as a UUID v4.
 * Not `crypto.randomUUID()`: browsers only expose it in secure contexts, and the PWA is served
 * over plain HTTP on the home network (D-38). `getRandomValues`, behind `getRandomBytes`, works there.
 */
export const uuidV4 = (bytes: Uint8Array): string => {
  const b = Uint8Array.from(bytes.subarray(0, 16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

/** A fresh UUID v4 for a new profile. */
export const newProfileId = (): string => uuidV4(getRandomBytes(16));
