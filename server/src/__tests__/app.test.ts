import { serverName } from '../app';

describe('etagere-server', () => {
  it('resolves the shared workspace', () => {
    expect(serverName()).toBe('Étagère');
  });
});
