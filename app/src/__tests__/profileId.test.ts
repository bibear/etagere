import { newProfileId, uuidV4 } from '../session/profileId';

// Only random bytes: crypto.randomUUID() does not exist on a plain-HTTP LAN page.
jest.mock('expo-crypto', () => ({
  getRandomBytes: jest.fn((size: number) => new Uint8Array(size).fill(0xff)),
}));

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('profile id', () => {
  it('formats 16 bytes as a UUID v4, forcing the version and variant bits', () => {
    const bytes = Uint8Array.from({ length: 16 }, (_, i) => i);

    expect(uuidV4(bytes)).toBe('00010203-0405-4607-8809-0a0b0c0d0e0f');
  });

  it('builds the id from random bytes, without crypto.randomUUID', () => {
    expect(newProfileId()).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
    expect(newProfileId()).toMatch(UUID_V4);
  });
});
