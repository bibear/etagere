import { ApiClient, ApiError } from '../api/client';
import { fakeFetch } from '../test/fakeFetch';

const PROFILE = '3b241101-e2bb-4255-8caf-4136c566a962';

describe('ApiClient', () => {
  it('sends X-Etagere-Profile when a profile exists', async () => {
    const server = fakeFetch({ 'GET /api/health': { body: { status: 'ok' } } });
    const api = new ApiClient({
      baseUrl: 'http://h:4848/',
      profileId: PROFILE,
      fetch: server.fetch,
    });

    await expect(api.health()).resolves.toEqual({ status: 'ok' });

    expect(server.calls[0]?.headers['x-etagere-profile']).toBe(PROFILE);
    expect(server.calls[0]?.path).toBe('/api/health');
  });

  it('sends no profile header without a profile', async () => {
    const server = fakeFetch({ 'GET /api/server-info': { body: { bookCount: 3 } } });
    const api = new ApiClient({ baseUrl: 'http://h:4848', fetch: server.fetch });

    await api.serverInfo();

    expect(server.calls[0]?.headers['x-etagere-profile']).toBeUndefined();
  });

  it('sends JSON bodies', async () => {
    const server = fakeFetch({ 'PUT /api/profiles/x': (body) => ({ body }) });
    const api = new ApiClient({ baseUrl: 'http://h', fetch: server.fetch });

    await expect(api.put('/api/profiles/x', { name: 'Inès' })).resolves.toEqual({ name: 'Inès' });
    expect(server.calls[0]?.headers['content-type']).toBe('application/json');
  });

  it('throws an ApiError with the server code and body', async () => {
    const server = fakeFetch({
      'POST /api/books': { status: 409, body: { code: 'already_in_library', book: { id: 'b1' } } },
    });
    const api = new ApiClient({ baseUrl: 'http://h', fetch: server.fetch });

    const error = await api.post('/api/books', {}).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 409,
      code: 'already_in_library',
      body: { book: { id: 'b1' } },
    });
  });

  it('maps an unreachable server to status 0 / network', async () => {
    const api = new ApiClient({
      baseUrl: 'http://h',
      fetch: fakeFetch({ 'GET /x': 'offline' }).fetch,
    });
    await expect(api.get('/x')).rejects.toMatchObject({ status: 0, code: 'network' });
  });

  it('maps a non-JSON error to internal_error', async () => {
    const fetchImpl = (async () => new Response('<html>', { status: 502 })) as typeof fetch;
    const api = new ApiClient({ baseUrl: 'http://h', fetch: fetchImpl });
    await expect(api.get('/x')).rejects.toMatchObject({ status: 502, code: 'internal_error' });
  });

  it('resolves 204 to undefined', async () => {
    const server = fakeFetch({ 'DELETE /api/books/b1': { status: 204 } });
    const api = new ApiClient({ baseUrl: 'http://h', fetch: server.fetch });
    await expect(api.delete('/api/books/b1')).resolves.toBeUndefined();
  });

  it('builds absolute URLs from server-relative paths', () => {
    const api = new ApiClient({ baseUrl: 'http://h:4848/' });
    expect(api.url('/api/covers/b1.jpg')).toBe('http://h:4848/api/covers/b1.jpg');
    expect(api.url('api/x')).toBe('http://h:4848/api/x');
  });
});
