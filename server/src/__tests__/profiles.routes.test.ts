import { randomUUID } from 'node:crypto';

import type { ServerEvent } from '@etagere/shared';

import { TEST_NOW, type TestApp, buildTestApp } from './support/test-app';

describe('profiles API', () => {
  let t: TestApp;
  let events: ServerEvent[];

  beforeEach(() => {
    t = buildTestApp();
    events = [];
    t.app.events.subscribe((event) => events.push(event));
  });
  afterEach(() => t.close());

  const put = (id: string, body: unknown, header?: string) =>
    t.app.inject({
      method: 'PUT',
      url: `/api/profiles/${id}`,
      payload: body as object,
      headers: header === undefined ? {} : { 'x-etagere-profile': header },
    });

  it('creates a profile without a header (first launch) and lists it', async () => {
    const id = randomUUID();
    const created = await put(id, { name: '  Inès ', color: '#2C4A6B' });

    expect(created.statusCode).toBe(200);
    expect(created.json()).toEqual({
      id,
      name: 'Inès',
      color: '#2C4A6B',
      createdAt: TEST_NOW.toISOString(),
    });
    const list = await t.app.inject({ method: 'GET', url: '/api/profiles' });
    expect(list.json()).toEqual({ profiles: [created.json()] });
    expect(events).toEqual([{ type: 'profiles.changed', id }]);
  });

  it('creates a profile when the header already carries the new id', async () => {
    const id = randomUUID();
    expect((await put(id, { name: 'Léo', color: '#B5523B' }, id)).statusCode).toBe(200);
  });

  it('updates its own profile with the matching header', async () => {
    const id = t.seedProfile('Bruno');
    const response = await put(id, { name: 'Bruno S.', color: '#6B4E8A' }, id);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ id, name: 'Bruno S.', color: '#6B4E8A' });
  });

  it('refuses to write another profile than the header one', async () => {
    const mine = t.seedProfile('Bruno');
    const other = t.seedProfile('Inès');
    const response = await put(other, { name: 'Hacked', color: '#000000' }, mine);
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ code: 'profile_mismatch' });
  });

  it('refuses to update an existing profile without a header', async () => {
    const id = t.seedProfile('Bruno');
    const response = await put(id, { name: 'X', color: '#000000' });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ code: 'unknown_profile' });
  });

  it('validates the id and the body', async () => {
    const badId = await put('not-a-uuid', { name: 'A', color: '#000000' });
    expect(badId.statusCode).toBe(400);
    expect(badId.json()).toEqual({ code: 'invalid_input', fields: ['id'] });

    const badBody = await put(randomUUID(), { name: '', color: 'green', extra: 1 });
    expect(badBody.statusCode).toBe(400);
    expect(badBody.json().fields).toEqual(expect.arrayContaining(['name', 'color']));
  });

  it('soft deletes a profile: hidden from the list, history kept, reading freed', async () => {
    const me = t.seedProfile('Bruno');
    const gone = t.seedProfile('Inès');
    const at = TEST_NOW.toISOString();
    t.db
      .prepare(
        `INSERT INTO books (id, title, source, added_by, added_at, updated_at)
         VALUES ('b1', 'Dune', 'manual', ?, ?, ?)`,
      )
      .run(gone, at, at);
    t.db
      .prepare(
        `INSERT INTO readings (id, book_id, profile_id, started_at, state)
         VALUES ('r1', 'b1', ?, ?, 'reading')`,
      )
      .run(gone, at);

    const response = await t.app.inject({
      method: 'DELETE',
      url: `/api/profiles/${gone}`,
      headers: { 'x-etagere-profile': me },
    });

    expect(response.statusCode).toBe(204);
    const list = await t.app.inject({ method: 'GET', url: '/api/profiles' });
    expect(list.json().profiles.map((p: { id: string }) => p.id)).toEqual([me]);
    expect(t.db.prepare('SELECT name, removed_at FROM profiles WHERE id = ?').get(gone)).toEqual({
      name: 'Inès',
      removed_at: at,
    });
    expect(t.db.prepare("SELECT state FROM readings WHERE id = 'r1'").get()).toEqual({
      state: 'abandoned',
    });
    expect(events).toEqual([
      { type: 'profiles.changed', id: gone },
      { type: 'books.changed', id: 'b1' },
    ]);
  });

  it('a removed profile can no longer mutate', async () => {
    const me = t.seedProfile('Bruno');
    await t.app.inject({
      method: 'DELETE',
      url: `/api/profiles/${me}`,
      headers: { 'x-etagere-profile': me },
    });
    const again = await t.app.inject({
      method: 'DELETE',
      url: `/api/profiles/${me}`,
      headers: { 'x-etagere-profile': me },
    });
    expect(again.statusCode).toBe(401);
    expect(again.json()).toEqual({ code: 'unknown_profile' });
  });

  it('a removed profile written again by its device is restored', async () => {
    const id = t.seedProfile('Bruno');
    t.db.prepare('UPDATE profiles SET removed_at = ? WHERE id = ?').run('2026-10-01', id);
    const response = await put(id, { name: 'Bruno', color: '#1F6B4A' }, id);
    expect(response.statusCode).toBe(200);
    const list = await t.app.inject({ method: 'GET', url: '/api/profiles' });
    expect(list.json().profiles).toHaveLength(1);
  });

  it('DELETE needs a known profile header and an existing target', async () => {
    const target = t.seedProfile('Inès');
    const anonymous = await t.app.inject({ method: 'DELETE', url: `/api/profiles/${target}` });
    expect(anonymous.statusCode).toBe(401);
    expect(anonymous.json()).toEqual({ code: 'unknown_profile' });

    const unknownHeader = await t.app.inject({
      method: 'DELETE',
      url: `/api/profiles/${target}`,
      headers: { 'x-etagere-profile': randomUUID() },
    });
    expect(unknownHeader.statusCode).toBe(401);

    const me = t.seedProfile('Bruno');
    const missing = await t.app.inject({
      method: 'DELETE',
      url: `/api/profiles/${randomUUID()}`,
      headers: { 'x-etagere-profile': me },
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({ code: 'not_found' });
  });
});
