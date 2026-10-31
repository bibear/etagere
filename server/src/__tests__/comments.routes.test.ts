import { randomUUID } from 'node:crypto';

import type { Comment, ServerEvent } from '@etagere/shared';

import { TEST_NOW, type TestApp, buildTestApp } from './support/test-app';

describe('comments API', () => {
  let t: TestApp;
  let me: string;
  let ines: string;
  let book: string;
  let clock: Date;
  let events: ServerEvent[];

  beforeEach(async () => {
    clock = new Date(TEST_NOW);
    t = buildTestApp({ now: () => clock });
    me = t.seedProfile('Bruno', '#1F6B4A');
    ines = t.seedProfile('Inès', '#2C4A6B');
    const response = await t.app.inject({
      method: 'POST',
      url: '/api/books',
      headers: { 'x-etagere-profile': me },
      payload: { title: 'Dune', authors: ['Frank Herbert'] },
    });
    book = response.json().id;
    events = [];
    t.app.events.subscribe((event) => events.push(event));
  });
  afterEach(() => t.close());

  const post = (text: unknown, profile: string = me, bookId: string = book) =>
    t.app.inject({
      method: 'POST',
      url: `/api/books/${bookId}/comments`,
      headers: { 'x-etagere-profile': profile },
      payload: { text },
    });

  const list = async (bookId: string = book) =>
    t.app.inject({ method: 'GET', url: `/api/books/${bookId}/comments` });

  it('posts a comment and lists comments newest first', async () => {
    const first = await post('  Un chef-d’œuvre.  ');
    clock = new Date(clock.getTime() + 60_000);
    const second = await post('Trop long au début', ines);

    expect(first.statusCode).toBe(201);
    expect(first.json()).toEqual({
      id: expect.any(String),
      bookId: book,
      author: { id: me, name: 'Bruno', color: '#1F6B4A' },
      text: 'Un chef-d’œuvre.',
      createdAt: TEST_NOW.toISOString(),
      updatedAt: TEST_NOW.toISOString(),
    });
    const comments = (await list()).json().comments as Comment[];
    expect(comments.map((comment) => comment.id)).toEqual([second.json().id, first.json().id]);
    expect(events).toEqual([
      { type: 'comments.changed', id: book },
      { type: 'comments.changed', id: book },
    ]);
    const detail = await t.app.inject({ method: 'GET', url: `/api/books/${book}` });
    expect(detail.json().commentCount).toBe(2);
  });

  it('the author edits and deletes their comment', async () => {
    const id = (await post('Bien')).json().id;
    clock = new Date(clock.getTime() + 60_000);
    events = [];

    const edited = await t.app.inject({
      method: 'PATCH',
      url: `/api/comments/${id}`,
      headers: { 'x-etagere-profile': me },
      payload: { text: 'Très bien' },
    });
    expect(edited.statusCode).toBe(200);
    expect(edited.json()).toMatchObject({
      text: 'Très bien',
      createdAt: TEST_NOW.toISOString(),
      updatedAt: clock.toISOString(),
    });

    const deleted = await t.app.inject({
      method: 'DELETE',
      url: `/api/comments/${id}`,
      headers: { 'x-etagere-profile': me },
    });
    expect(deleted.statusCode).toBe(204);
    expect((await list()).json()).toEqual({ comments: [] });
    expect(events).toEqual([
      { type: 'comments.changed', id: book },
      { type: 'comments.changed', id: book },
    ]);
  });

  it('nobody else can edit or delete it: 403 not_author', async () => {
    const id = (await post('Bien')).json().id;
    for (const method of ['PATCH', 'DELETE'] as const) {
      const response = await t.app.inject({
        method,
        url: `/api/comments/${id}`,
        headers: { 'x-etagere-profile': ines },
        ...(method === 'PATCH' ? { payload: { text: 'Pas bien' } } : {}),
      });
      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ code: 'not_author' });
    }
    expect((await list()).json().comments[0].text).toBe('Bien');
  });

  it('validates the text, the profile and the targets', async () => {
    const empty = await post('   ');
    expect(empty.statusCode).toBe(400);
    expect(empty.json()).toEqual({ code: 'invalid_input', fields: ['text'] });
    expect((await post('x'.repeat(2001))).statusCode).toBe(400);
    expect((await post('ok', randomUUID())).statusCode).toBe(401);
    expect((await post('ok', me, randomUUID())).statusCode).toBe(404);
    expect((await list(randomUUID())).statusCode).toBe(404);
    const missing = await t.app.inject({
      method: 'DELETE',
      url: `/api/comments/${randomUUID()}`,
      headers: { 'x-etagere-profile': me },
    });
    expect(missing.statusCode).toBe(404);
  });

  it('a removed member keeps their name on their comments', async () => {
    await post('Bien', ines);
    t.db.prepare('UPDATE profiles SET removed_at = ? WHERE id = ?').run('2026-11-01', ines);
    expect((await list()).json().comments[0].author).toEqual({
      id: ines,
      name: 'Inès',
      color: '#2C4A6B',
    });
  });
});
