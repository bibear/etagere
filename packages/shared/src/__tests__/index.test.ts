import { APP_NAME } from '..';

describe('@etagere/shared', () => {
  it('exposes the app name', () => {
    expect(APP_NAME).toBe('Étagère');
  });
});
