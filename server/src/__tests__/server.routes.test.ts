import { SERVER_VERSION } from '../version';
import { type TestApp, buildTestApp } from './support/test-app';

describe('server routes', () => {
  let t: TestApp;

  afterEach(() => t.close());

  it('GET /api/health answers ok with the version and household name', async () => {
    t = buildTestApp({ householdName: 'Chez nous' });
    const response = await t.app.inject({ method: 'GET', url: '/api/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'ok',
      name: 'Étagère',
      version: SERVER_VERSION,
      householdName: 'Chez nous',
    });
  });

  it('GET /api/server-info counts books and active profiles and lists LAN URLs', async () => {
    t = buildTestApp({ lanUrls: () => ['http://192.168.1.20:4848'] });
    const p1 = t.seedProfile('Bruno');
    const p2 = t.seedProfile('Inès');
    t.db.prepare('UPDATE profiles SET removed_at = ? WHERE id = ?').run('2026-10-31', p2);
    t.db
      .prepare(
        `INSERT INTO books (id, title, source, added_by, added_at, updated_at)
         VALUES ('b1', 'Dune', 'manual', ?, 'x', 'x')`,
      )
      .run(p1);

    const response = await t.app.inject({ method: 'GET', url: '/api/server-info' });

    expect(response.json()).toEqual({
      version: SERVER_VERSION,
      bookCount: 1,
      profileCount: 1,
      urls: ['http://192.168.1.20:4848'],
    });
  });
});
