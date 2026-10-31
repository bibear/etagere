// A fake Open Library for tests: routes URLs to canned responses, records every request.

export const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

export type FakeRoute = unknown | Response | Error | (() => Response | Promise<Response>);

export interface FakeOpenLibrary {
  fetch: typeof fetch;
  requests: string[];
}

/** `routes` maps a full URL to a JSON body, a Response, an Error (network failure) or a factory. */
export function fakeOpenLibrary(routes: Record<string, FakeRoute>): FakeOpenLibrary {
  const requests: string[] = [];
  const fetch: typeof globalThis.fetch = async (input) => {
    const url = String(input);
    requests.push(url);
    if (!(url in routes)) return new Response('not found', { status: 404 });
    const route = routes[url];
    if (route instanceof Error) throw route;
    if (route instanceof Response) return route.clone();
    if (typeof route === 'function') return (route as () => Response | Promise<Response>)();
    return new Response(JSON.stringify(route), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  return { fetch, requests };
}

export const DUNE_ISBN = '9782266320481';

/** Open Library records of a French edition of Dune. */
export const duneRoutes = (): Record<string, FakeRoute> => ({
  [`https://openlibrary.org/isbn/${DUNE_ISBN}.json`]: {
    title: 'Dune',
    authors: [{ key: '/authors/OL79034A' }],
    publishers: ['Pocket'],
    publish_date: 'March 2021',
    number_of_pages: 928,
    works: [{ key: '/works/OL893415W' }],
    covers: [12345],
  },
  'https://openlibrary.org/authors/OL79034A.json': { name: 'Frank Herbert' },
  'https://openlibrary.org/works/OL893415W.json': {
    description: { type: '/type/text', value: 'Sur Arrakis, la planète des sables…' },
    subjects: ['Science fiction', 'Accessible book', 'nyt:mass-market', 'Ecology', 'Fiction'],
  },
  [`https://covers.openlibrary.org/b/isbn/${DUNE_ISBN}-L.jpg?default=false`]: new Response(JPEG, {
    status: 200,
    headers: { 'content-type': 'image/jpeg' },
  }),
});
