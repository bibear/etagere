/** A canned answer: JSON body and status (default 200). */
export interface FakeResponse {
  status?: number;
  body?: unknown;
}

export interface FakeFetch {
  fetch: typeof fetch;
  /** Every request received, in order: method, path (with query), headers, parsed body. */
  calls: { method: string; path: string; headers: Record<string, string>; body: unknown }[];
}

/**
 * A fake server for component tests: routes keyed by `"METHOD /path"` (query included when
 * present). Unknown routes answer 404 not_found. A function route receives the parsed body.
 * Pass `'offline'` as a route value to simulate an unreachable server.
 */
export function fakeFetch(
  routes: Record<string, FakeResponse | 'offline' | ((body: unknown) => FakeResponse)>,
): FakeFetch {
  const calls: FakeFetch['calls'] = [];
  const fetchImpl = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const method = (init.method ?? 'GET').toUpperCase();
    const path = `${url.pathname}${url.search}`;
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ method, path, headers: { ...(init.headers as Record<string, string>) }, body });
    const route = routes[`${method} ${path}`] ?? routes[`${method} ${url.pathname}`];
    if (route === 'offline') throw new TypeError('Network request failed');
    const answer =
      typeof route === 'function'
        ? route(body)
        : (route ?? { status: 404, body: { code: 'not_found' } });
    const status = answer.status ?? 200;
    return new Response(status === 204 ? null : JSON.stringify(answer.body ?? {}), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  };
  return { fetch: fetchImpl as typeof fetch, calls };
}
