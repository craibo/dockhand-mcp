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
  del<T>(path: string, params?: QueryParams): Promise<T>;
}

type QueryParams = Record<string, string | number | boolean | undefined>;

function buildUrl(baseUrl: string, path: string, params?: QueryParams): string {
  const url = new URL(path, baseUrl);
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
  async function request<T>(method: string, path: string, params?: QueryParams, body?: unknown): Promise<T> {
    const url = buildUrl(config.dockhandUrl, path, params);
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${config.dockhandApiToken}`,
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {})
      },
      body: body !== undefined ? JSON.stringify(body) : undefined
    });

    if (!response.ok) {
      const { message, details } = await parseErrorBody(response);
      throw new DockhandError(response.status, message, details);
    }

    return (await response.json()) as T;
  }

  return {
    get: (path, params) => request('GET', path, params),
    post: (path, body, params) => request('POST', path, params, body),
    del: (path, params) => request('DELETE', path, params)
  };
}
