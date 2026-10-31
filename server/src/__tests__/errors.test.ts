import { profileInputSchema } from '@etagere/shared';
import type { FastifyInstance } from 'fastify';
import { Writable } from 'node:stream';
import pino from 'pino';

import { HttpError } from '../http/errors';
import { requireProfile } from '../http/profile';
import { parseInput } from '../http/validation';
import { type TestApp, buildTestApp } from './support/test-app';

const addTestRoutes = (app: FastifyInstance) =>
  app.register(
    async (api) => {
      api.get('/boom', async () => {
        throw new Error('secret stack detail /etc/passwd');
      });
      api.get('/conflict', async () => {
        throw new HttpError(409, 'already_in_library', { book: { id: 'b1' } });
      });
      api.post('/profiles-test', async (request) => parseInput(profileInputSchema, request.body));
      api.post('/me', async (request) => ({ id: requireProfile(request).id }));
    },
    { prefix: '/api/test' },
  );

describe('error format', () => {
  let t: TestApp;
  let logs: string[];

  beforeEach(() => {
    logs = [];
    const stream = new Writable({
      write(chunk, _enc, done) {
        logs.push(String(chunk));
        done();
      },
    });
    t = buildTestApp({ logger: pino({ level: 'error' }, stream) });
    addTestRoutes(t.app);
  });

  afterEach(() => t.close());

  it('answers 500 internal_error without leaking, and logs the detail', async () => {
    const response = await t.app.inject({ method: 'GET', url: '/api/test/boom' });
    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ code: 'internal_error' });
    expect(response.body).not.toContain('secret');
    expect(logs.join('')).toContain('secret stack detail');
  });

  it('answers an HttpError with its status, code and details', async () => {
    const response = await t.app.inject({ method: 'GET', url: '/api/test/conflict' });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ code: 'already_in_library', book: { id: 'b1' } });
  });

  it('answers 400 invalid_input with the invalid fields', async () => {
    const response = await t.app.inject({
      method: 'POST',
      url: '/api/test/profiles-test',
      payload: { name: '', color: 'red' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ code: 'invalid_input', fields: ['name', 'color'] });
  });

  it('returns the parsed value when the input is valid', async () => {
    const response = await t.app.inject({
      method: 'POST',
      url: '/api/test/profiles-test',
      payload: { name: ' Inès ', color: '#2C4A6B' },
    });
    expect(response.json()).toEqual({ name: 'Inès', color: '#2C4A6B' });
  });

  it('answers 400 invalid_input to malformed JSON', async () => {
    const response = await t.app.inject({
      method: 'POST',
      url: '/api/test/profiles-test',
      headers: { 'content-type': 'application/json' },
      payload: '{"name": ',
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ code: 'invalid_input' });
  });

  it('answers 404 not_found to an unknown route', async () => {
    const response = await t.app.inject({ method: 'GET', url: '/api/nope' });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ code: 'not_found' });
  });

  describe('requireProfile', () => {
    it.each([
      ['no header', {}],
      ['an unknown id', { 'x-etagere-profile': '3b241101-e2bb-4255-8caf-4136c566a962' }],
    ])('answers 401 unknown_profile with %s', async (_label, headers) => {
      const response = await t.app.inject({ method: 'POST', url: '/api/test/me', headers });
      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ code: 'unknown_profile' });
    });

    it('answers 401 for a removed profile', async () => {
      const id = t.seedProfile();
      t.db.prepare('UPDATE profiles SET removed_at = ? WHERE id = ?').run('2026-10-31', id);
      const response = await t.app.inject({
        method: 'POST',
        url: '/api/test/me',
        headers: { 'x-etagere-profile': id },
      });
      expect(response.statusCode).toBe(401);
    });

    it('accepts a known profile', async () => {
      const id = t.seedProfile();
      const response = await t.app.inject({
        method: 'POST',
        url: '/api/test/me',
        headers: { 'x-etagere-profile': id },
      });
      expect(response.json()).toEqual({ id });
    });
  });
});
