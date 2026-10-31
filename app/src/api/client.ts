import { type HealthResponse, PROFILE_HEADER, type ServerInfo } from '@etagere/shared';

/**
 * An API failure. `status` 0 with code `network` means the server could not be reached;
 * otherwise `code` is the server's stable error code (docs/ARCHITECTURE.md).
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly body: Record<string, unknown> = {},
  ) {
    super(`${status} ${code}`);
    this.name = 'ApiError';
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  profileId?: string | null;
  fetch?: typeof fetch;
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * Thin JSON client of the Étagère server. Sends `X-Etagere-Profile` when a profile exists.
 * Feature modules add typed helpers next to this file (`books.ts`, …) on top of `request`.
 */
export class ApiClient {
  readonly baseUrl: string;
  readonly profileId: string | null;
  private readonly fetchImpl: typeof fetch;

  constructor({ baseUrl, profileId = null, fetch: fetchImpl }: ApiClientOptions) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.profileId = profileId;
    this.fetchImpl = fetchImpl ?? ((...args) => globalThis.fetch(...args));
  }

  /** The same client (network, profile) pointed at another server, e.g. to test an address. */
  withBaseUrl(baseUrl: string): ApiClient {
    return new ApiClient({ baseUrl, profileId: this.profileId, fetch: this.fetchImpl });
  }

  /** Absolute URL of a server-relative path such as a `coverUrl`. */
  url(path: string): string {
    return `${this.baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
  }

  async request<T>(method: Method, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (this.profileId) headers[PROFILE_HEADER] = this.profileId;
    if (body !== undefined) headers['content-type'] = 'application/json';
    let response: Response;
    try {
      response = await this.fetchImpl(this.url(path), {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiError(0, 'network');
    }
    if (response.status === 204) return undefined as T;
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const errorBody =
        payload !== null && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
      const code = typeof errorBody.code === 'string' ? errorBody.code : 'internal_error';
      throw new ApiError(response.status, code, errorBody);
    }
    return payload as T;
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }
  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body ?? {});
  }
  put<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PUT', path, body);
  }
  patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PATCH', path, body);
  }
  delete<T = void>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }

  health(): Promise<HealthResponse> {
    return this.get('/api/health');
  }
  serverInfo(): Promise<ServerInfo> {
    return this.get('/api/server-info');
  }
}
