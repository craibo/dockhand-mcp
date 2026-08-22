// src/dockhandClient.ts

export class DockhandError extends Error {
  status: number;
  details?: string;

  constructor(status: number, message: string, details?: string) {
    super(message);
    this.name = 'DockhandError';
    this.status = status;
    this.details = details;
  }
}

export interface DockhandClient {
  get<T>(path: string, params?: QueryParams): Promise<T>;
  post<T>(path: string, body?: unknown, params?: QueryParams): Promise<T>;
  postJob<T>(path: string, body?: unknown, params?: QueryParams): Promise<T>;
  del<T>(path: string, params?: QueryParams): Promise<T>;
}

type QueryParams = Record<string, string | number | boolean | undefined>;

function buildUrl(baseUrl: string, path: string, params?: QueryParams): string {
  const base = baseUrl.replace(/\/$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(`${base}${normalizedPath}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

async function parseErrorBody(response: Response): Promise<{ message: string; details?: string }> {
  const text = await response.text();
  try {
    const parsed = JSON.parse(text) as { error?: string; details?: string };
    if (parsed && typeof parsed.error === 'string') {
      return { message: parsed.error, details: parsed.details };
    }
  } catch {
    // not JSON, fall through
  }
  return { message: text || response.statusText };
}

export function createDockhandClient(config: { dockhandUrl: string; dockhandApiToken: string }): DockhandClient {
  async function request<T>(
    method: string,
    path: string,
    params?: QueryParams,
    body?: unknown,
    accept: string = 'application/json'
  ): Promise<T> {
    const url = buildUrl(config.dockhandUrl, path, params);
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${config.dockhandApiToken}`,
        Accept: accept,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {})
      },
      body: body !== undefined ? JSON.stringify(body) : undefined
    });

    if (!response.ok) {
      const { message, details } = await parseErrorBody(response);
      throw new DockhandError(response.status, message, details);
    }

    const text = await response.text();
    if (text.length === 0) {
      return undefined as T;
    }
    return JSON.parse(text) as T;
  }

  return {
    get: (path, params) => request('GET', path, params),
    post: (path, body, params) => request('POST', path, params, body),
    postJob: (path, body, params) => request('POST', path, params, body, 'application/json, text/event-stream'),
    del: (path, params) => request('DELETE', path, params)
  };
}
