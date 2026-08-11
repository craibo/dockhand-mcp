# dockhand-mcp Sidecar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone MCP sidecar server that exposes Dockhand's core Docker-management REST API (containers, images, volumes, networks, stacks, environments) as MCP tools over Streamable HTTP.

**Architecture:** A stateless Express app using `@modelcontextprotocol/server` + `@modelcontextprotocol/express` + `@modelcontextprotocol/node`. Every MCP tool call is translated into a single `fetch` call against Dockhand's REST API (`DOCKHAND_URL`) using a Bearer `DOCKHAND_API_TOKEN`. Inbound requests to the sidecar's own `/mcp` endpoint are gated by a separate shared-secret `MCP_AUTH_TOKEN` checked in custom Express middleware.

**Tech Stack:** TypeScript, Node 22+, Express 5, `@modelcontextprotocol/server@^2.0.0`, `@modelcontextprotocol/express@^2.0.0`, `@modelcontextprotocol/node@^2.0.0`, Zod v4, Vitest, `msw` for HTTP mocking, `tsx` for dev, `tsc` for build.

## Global Constraints

- Package versions: `@modelcontextprotocol/server`, `@modelcontextprotocol/express`, `@modelcontextprotocol/node` all pinned to `^2.0.0`; `zod` pinned to `^4.2.0` (required peer of `@modelcontextprotocol/server@2.0.0`).
- Every tool except `list_environments` takes a required `environmentId: number` parameter (Zod `.int().positive()`).
- `dockhandClient.ts` sends `Accept: application/json` on every request — this makes Dockhand's job-style endpoints (`images/pull`, `stacks/*/deploy`, `stacks/*/down`) return their final result synchronously as plain JSON rather than `{ jobId }`, per `src/lib/server/sse-parser.ts`'s `prefersJSON()` check in the Dockhand repo. No SSE/streaming client code is needed anywhere in this repo.
- Dockhand REST errors are shaped `{ error: string, details?: string }` with a non-2xx status. All tool handlers must convert these into `{ content: [...], isError: true }` MCP results, never throw raw fetch/HTTP errors.
- Mutating tools (`start_container`, `stop_container`, `restart_container`, `remove_container`, `pull_image`, `remove_image`, `remove_volume`, `deploy_stack`, `stop_stack`) must not be registered on the MCP server at all when `DOCKHAND_MCP_READONLY=true` — checked at registration time in `index.ts`, not inside each handler.
- `MCP_AUTH_TOKEN` and (`DOCKHAND_API_TOKEN` or `DOCKHAND_API_TOKEN_FILE`) and `DOCKHAND_URL` are required; the process must fail fast (exit non-zero with a clear message) at startup if missing.
- No database, no persistent state, no stdio transport.

---

## File Structure

```
src/
  config.ts              # env var loading/validation, fails fast
  dockhandClient.ts       # fetch wrapper: builds Dockhand requests, normalizes errors
  toolError.ts             # shared helper: turns a DockhandError into an MCP isError result
  auth.ts                   # Express middleware: checks Authorization header against MCP_AUTH_TOKEN
  types.ts                   # shared Zod schemas (environmentId)
  tools/
    environments.ts          # registerEnvironmentTools(server, client)
    containers.ts              # registerContainerTools(server, client, readonly)
    images.ts                    # registerImageTools(server, client, readonly)
    volumes.ts                     # registerVolumeTools(server, client, readonly)
    networks.ts                     # registerNetworkTools(server, client)
    stacks.ts                        # registerStackTools(server, client, readonly)
  server.ts                  # buildServer(client, readonly): creates McpServer, calls all registerXTools
  app.ts                       # creates Express app, wires auth middleware + /mcp route
  index.ts                       # entrypoint: loads config, starts HTTP listener
tests/
  config.test.ts
  dockhandClient.test.ts
  auth.test.ts
  tools/
    environments.test.ts
    containers.test.ts
    images.test.ts
    volumes.test.ts
    networks.test.ts
    stacks.test.ts
Dockerfile
docker-compose.example.yaml
package.json
tsconfig.json
vitest.config.ts
README.md
```

**Why split this way:** `dockhandClient.ts` and `toolError.ts` are the only pieces that know about Dockhand's HTTP/error conventions — every tool file depends on them but never constructs `fetch` calls directly. Each `tools/*.ts` file owns exactly one Dockhand domain, mirrors the REST route grouping, and stays small enough to review in one pass. `server.ts` (wiring) is separate from `app.ts` (HTTP framing) so tests can build an `McpServer` in isolation without spinning up Express.

---

## Task 1: Project scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.gitignore` (already exists from spec commit — verify contents, extend if needed)
- Create: `src/index.ts` (placeholder, just enough to build)

**Interfaces:**
- Produces: a working `npm run build`, `npm run dev`, `npm test` toolchain that later tasks build on.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "dockhand-mcp",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@modelcontextprotocol/server": "^2.0.0",
    "@modelcontextprotocol/express": "^2.0.0",
    "@modelcontextprotocol/node": "^2.0.0",
    "express": "^5.0.0",
    "zod": "^4.2.0"
  },
  "devDependencies": {
    "@types/express": "^5.0.0",
    "@types/node": "^22.0.0",
    "msw": "^2.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.6.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": false,
    "sourceMap": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Write `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts']
  }
});
```

- [ ] **Step 4: Verify/extend `.gitignore`**

Confirm it contains at least: `node_modules/`, `dist/`, `build/`, `.env`, `.idea/`, `.DS_Store`. It was created in the design-doc commit — read it and add any missing entries.

- [ ] **Step 5: Write placeholder `src/index.ts`**

```typescript
console.log('dockhand-mcp starting...');
```

- [ ] **Step 6: Install dependencies**

Run: `npm install`
Expected: lockfile created, no errors.

- [ ] **Step 7: Verify build and dev toolchain**

Run: `npm run build`
Expected: `dist/index.js` created, no TypeScript errors.

Run: `npm run dev` briefly (then stop it — e.g. `timeout 5 npm run dev` or start and Ctrl-C)
Expected: prints `dockhand-mcp starting...` with no errors.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore src/index.ts
git commit -m "chore: scaffold TypeScript project"
```

---

## Task 2: Config loading (`config.ts`)

**Files:**
- Create: `src/config.ts`
- Test: `tests/config.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  export interface Config {
    dockhandUrl: string;
    dockhandApiToken: string;
    mcpAuthToken: string;
    readonly: boolean;
    port: number;
  }
  export class ConfigError extends Error {}
  export function loadConfig(env: NodeJS.ProcessEnv, readFileSync = fs.readFileSync): Config;
  ```
- `loadConfig` throws `ConfigError` (never calls `process.exit` itself — that's `index.ts`'s job) when required vars are missing or both/neither of `DOCKHAND_API_TOKEN`/`DOCKHAND_API_TOKEN_FILE` are set.

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/config.test.ts
import { describe, it, expect, vi } from 'vitest';
import { loadConfig, ConfigError } from '../src/config.js';

const baseEnv = {
  DOCKHAND_URL: 'http://dockhand:3000',
  DOCKHAND_API_TOKEN: 'dh_testtoken',
  MCP_AUTH_TOKEN: 'secret123'
};

describe('loadConfig', () => {
  it('loads a valid config with defaults', () => {
    const config = loadConfig(baseEnv as NodeJS.ProcessEnv);
    expect(config).toEqual({
      dockhandUrl: 'http://dockhand:3000',
      dockhandApiToken: 'dh_testtoken',
      mcpAuthToken: 'secret123',
      readonly: false,
      port: 8787
    });
  });

  it('parses DOCKHAND_MCP_READONLY=true', () => {
    const config = loadConfig({ ...baseEnv, DOCKHAND_MCP_READONLY: 'true' } as NodeJS.ProcessEnv);
    expect(config.readonly).toBe(true);
  });

  it('parses a custom PORT', () => {
    const config = loadConfig({ ...baseEnv, PORT: '9000' } as NodeJS.ProcessEnv);
    expect(config.port).toBe(9000);
  });

  it('reads the token from DOCKHAND_API_TOKEN_FILE when set', () => {
    const readFileSync = vi.fn().mockReturnValue('dh_fromfile\n');
    const env = { ...baseEnv, DOCKHAND_API_TOKEN: undefined, DOCKHAND_API_TOKEN_FILE: '/run/secrets/token' };
    const config = loadConfig(env as unknown as NodeJS.ProcessEnv, readFileSync);
    expect(config.dockhandApiToken).toBe('dh_fromfile');
    expect(readFileSync).toHaveBeenCalledWith('/run/secrets/token', 'utf-8');
  });

  it('throws ConfigError when DOCKHAND_URL is missing', () => {
    const { DOCKHAND_URL, ...rest } = baseEnv;
    expect(() => loadConfig(rest as NodeJS.ProcessEnv)).toThrow(ConfigError);
  });

  it('throws ConfigError when MCP_AUTH_TOKEN is missing', () => {
    const { MCP_AUTH_TOKEN, ...rest } = baseEnv;
    expect(() => loadConfig(rest as NodeJS.ProcessEnv)).toThrow(ConfigError);
  });

  it('throws ConfigError when neither DOCKHAND_API_TOKEN nor DOCKHAND_API_TOKEN_FILE is set', () => {
    const { DOCKHAND_API_TOKEN, ...rest } = baseEnv;
    expect(() => loadConfig(rest as NodeJS.ProcessEnv)).toThrow(ConfigError);
  });

  it('throws ConfigError when both DOCKHAND_API_TOKEN and DOCKHAND_API_TOKEN_FILE are set', () => {
    const env = { ...baseEnv, DOCKHAND_API_TOKEN_FILE: '/run/secrets/token' };
    expect(() => loadConfig(env as NodeJS.ProcessEnv)).toThrow(ConfigError);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/config.test.ts`
Expected: FAIL — `src/config.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// src/config.ts
import fs from 'node:fs';

export interface Config {
  dockhandUrl: string;
  dockhandApiToken: string;
  mcpAuthToken: string;
  readonly: boolean;
  port: number;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export function loadConfig(
  env: NodeJS.ProcessEnv,
  readFileSync: (path: string, encoding: 'utf-8') => string = fs.readFileSync as typeof fs.readFileSync
): Config {
  const dockhandUrl = env.DOCKHAND_URL;
  if (!dockhandUrl) {
    throw new ConfigError('DOCKHAND_URL is required');
  }

  const mcpAuthToken = env.MCP_AUTH_TOKEN;
  if (!mcpAuthToken) {
    throw new ConfigError('MCP_AUTH_TOKEN is required');
  }

  const hasToken = Boolean(env.DOCKHAND_API_TOKEN);
  const hasTokenFile = Boolean(env.DOCKHAND_API_TOKEN_FILE);
  if (hasToken === hasTokenFile) {
    throw new ConfigError(
      'Exactly one of DOCKHAND_API_TOKEN or DOCKHAND_API_TOKEN_FILE must be set'
    );
  }

  const dockhandApiToken = hasToken
    ? (env.DOCKHAND_API_TOKEN as string)
    : readFileSync(env.DOCKHAND_API_TOKEN_FILE as string, 'utf-8').trim();

  return {
    dockhandUrl,
    dockhandApiToken,
    mcpAuthToken,
    readonly: env.DOCKHAND_MCP_READONLY === 'true',
    port: env.PORT ? parseInt(env.PORT, 10) : 8787
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/config.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add src/config.ts tests/config.test.ts
git commit -m "feat: add config loading with env var validation"
```

---

## Task 3: Dockhand HTTP client (`dockhandClient.ts`)

**Files:**
- Create: `src/dockhandClient.ts`
- Test: `tests/dockhandClient.test.ts`

**Interfaces:**
- Consumes: `Config` from Task 2 (`dockhandUrl`, `dockhandApiToken`).
- Produces:
  ```typescript
  export class DockhandError extends Error {
    constructor(public status: number, message: string, public details?: string);
  }
  export interface DockhandClient {
    get<T>(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<T>;
    post<T>(path: string, body?: unknown, params?: Record<string, string | number | boolean | undefined>): Promise<T>;
    del<T>(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<T>;
  }
  export function createDockhandClient(config: Pick<Config, 'dockhandUrl' | 'dockhandApiToken'>): DockhandClient;
  ```
- `path` is joined onto `dockhandUrl` (e.g. `/api/containers`). `params` become query-string entries; `undefined` values are omitted. Every request sends `Authorization: Bearer <token>` and `Accept: application/json`. On a non-2xx response, throws `DockhandError` with `status` and the parsed `{ error, details }` body (falling back to the raw response text if the body isn't JSON-shaped).

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/dockhandClient.test.ts
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createDockhandClient, DockhandError } from '../src/dockhandClient.js';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const client = createDockhandClient({
  dockhandUrl: 'http://dockhand:3000',
  dockhandApiToken: 'dh_test'
});

describe('DockhandClient', () => {
  it('sends Authorization and Accept headers on GET', async () => {
    let seenHeaders: Headers | undefined;
    server.use(
      http.get('http://dockhand:3000/api/containers', ({ request }) => {
        seenHeaders = request.headers;
        return HttpResponse.json([{ id: 'abc' }]);
      })
    );
    const result = await client.get('/api/containers');
    expect(result).toEqual([{ id: 'abc' }]);
    expect(seenHeaders?.get('authorization')).toBe('Bearer dh_test');
    expect(seenHeaders?.get('accept')).toBe('application/json');
  });

  it('serializes query params, omitting undefined values', async () => {
    let seenUrl = '';
    server.use(
      http.get('http://dockhand:3000/api/containers', ({ request }) => {
        seenUrl = request.url;
        return HttpResponse.json([]);
      })
    );
    await client.get('/api/containers', { env: 1, all: undefined, tail: 'all' });
    const url = new URL(seenUrl);
    expect(url.searchParams.get('env')).toBe('1');
    expect(url.searchParams.has('all')).toBe(false);
    expect(url.searchParams.get('tail')).toBe('all');
  });

  it('sends a JSON body on POST', async () => {
    let seenBody: unknown;
    server.use(
      http.post('http://dockhand:3000/api/containers/abc/start', async ({ request }) => {
        seenBody = await request.json().catch(() => null);
        return HttpResponse.json({ success: true });
      })
    );
    const result = await client.post('/api/containers/abc/start', undefined, { env: 1 });
    expect(result).toEqual({ success: true });
  });

  it('throws DockhandError with status and parsed body on non-2xx JSON error', async () => {
    server.use(
      http.get('http://dockhand:3000/api/containers/missing', () =>
        HttpResponse.json({ error: 'Container not found' }, { status: 404 })
      )
    );
    await expect(client.get('/api/containers/missing')).rejects.toMatchObject({
      status: 404,
      message: 'Container not found'
    });
  });

  it('throws DockhandError with details when present', async () => {
    server.use(
      http.post('http://dockhand:3000/api/images/pull', () =>
        HttpResponse.json({ error: 'Failed to pull image', details: 'not found: image' }, { status: 500 })
      )
    );
    try {
      await client.post('/api/images/pull', { image: 'nope' });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(DockhandError);
      expect((err as DockhandError).status).toBe(500);
      expect((err as DockhandError).message).toBe('Failed to pull image');
      expect((err as DockhandError).details).toBe('not found: image');
    }
  });

  it('falls back to raw text when error body is not JSON', async () => {
    server.use(
      http.get('http://dockhand:3000/api/containers', () => new HttpResponse('Internal Server Error', { status: 500 }))
    );
    await expect(client.get('/api/containers')).rejects.toMatchObject({
      status: 500,
      message: 'Internal Server Error'
    });
  });

  it('supports DELETE with query params', async () => {
    server.use(
      http.delete('http://dockhand:3000/api/containers/abc', () => HttpResponse.json({ success: true }))
    );
    const result = await client.del('/api/containers/abc', { env: 1, force: true });
    expect(result).toEqual({ success: true });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/dockhandClient.test.ts`
Expected: FAIL — `src/dockhandClient.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/dockhandClient.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/dockhandClient.ts tests/dockhandClient.test.ts
git commit -m "feat: add Dockhand REST API client"
```

---

## Task 4: Tool error helper (`toolError.ts`) and shared types (`types.ts`)

**Files:**
- Create: `src/toolError.ts`
- Create: `src/types.ts`
- Test: `tests/toolError.test.ts`

**Interfaces:**
- Consumes: `DockhandError` from Task 3.
- Produces:
  ```typescript
  // toolError.ts
  export interface McpToolResult {
    content: Array<{ type: 'text'; text: string }>;
    isError?: boolean;
  }
  export function toErrorResult(error: unknown): McpToolResult;
  export function toTextResult(data: unknown): McpToolResult;

  // types.ts
  export const environmentIdSchema: ZodNumber; // z.number().int().positive()
  ```
- Every tool handler in later tasks catches `DockhandError` (and unknown errors) via `toErrorResult`, and wraps successful JSON payloads via `toTextResult` (JSON.stringify'd).

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/toolError.test.ts
import { describe, it, expect } from 'vitest';
import { toErrorResult, toTextResult } from '../src/toolError.js';
import { DockhandError } from '../src/dockhandClient.js';

describe('toErrorResult', () => {
  it('formats a DockhandError with details', () => {
    const result = toErrorResult(new DockhandError(403, 'Permission denied', 'missing containers:start'));
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Dockhand API error (403): Permission denied — missing containers:start');
  });

  it('formats a DockhandError without details', () => {
    const result = toErrorResult(new DockhandError(404, 'Container not found'));
    expect(result.content[0].text).toBe('Dockhand API error (404): Container not found');
  });

  it('formats a generic Error', () => {
    const result = toErrorResult(new Error('boom'));
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('boom');
  });

  it('formats a non-Error thrown value', () => {
    const result = toErrorResult('plain string failure');
    expect(result.content[0].text).toBe('plain string failure');
  });
});

describe('toTextResult', () => {
  it('JSON-stringifies the payload', () => {
    const result = toTextResult({ success: true, id: 'abc' });
    expect(result.isError).toBeUndefined();
    expect(result.content).toEqual([{ type: 'text', text: JSON.stringify({ success: true, id: 'abc' }, null, 2) }]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/toolError.test.ts`
Expected: FAIL — `src/toolError.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// src/toolError.ts
import { DockhandError } from './dockhandClient.js';

export interface McpToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export function toErrorResult(error: unknown): McpToolResult {
  let text: string;
  if (error instanceof DockhandError) {
    text = `Dockhand API error (${error.status}): ${error.message}`;
    if (error.details) {
      text += ` — ${error.details}`;
    }
  } else if (error instanceof Error) {
    text = error.message;
  } else {
    text = String(error);
  }
  return { content: [{ type: 'text', text }], isError: true };
}

export function toTextResult(data: unknown): McpToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}
```

```typescript
// src/types.ts
import * as z from 'zod';

export const environmentIdSchema = z.number().int().positive().describe('The Dockhand environment (Docker host) ID, from list_environments');
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/toolError.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/toolError.ts src/types.ts tests/toolError.test.ts
git commit -m "feat: add MCP tool result helpers and shared schemas"
```

---

## Task 5: Environment tools (`tools/environments.ts`)

**Files:**
- Create: `src/tools/environments.ts`
- Test: `tests/tools/environments.test.ts`

**Interfaces:**
- Consumes: `DockhandClient` (Task 3), `toTextResult`/`toErrorResult` (Task 4), `McpServer` from `@modelcontextprotocol/server`.
- Produces: `export function registerEnvironmentTools(server: McpServer, client: DockhandClient): void` — registers `list_environments`.

This task establishes the pattern every other `tools/*.ts` file follows: a `registerXTools(server, client, ...)` function called once from `server.ts` (Task 11).

- [ ] **Step 1: Write the failing test**

```typescript
// tests/tools/environments.test.ts
import { describe, it, expect, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/server';
import { registerEnvironmentTools } from '../../src/tools/environments.js';
import { DockhandError, type DockhandClient } from '../../src/dockhandClient.js';

function makeClient(overrides: Partial<DockhandClient> = {}): DockhandClient {
  return {
    get: vi.fn(),
    post: vi.fn(),
    del: vi.fn(),
    ...overrides
  };
}

async function callTool(server: McpServer, name: string, args: Record<string, unknown>) {
  // @ts-expect-error accessing internal registry for direct unit testing
  const tool = server._registeredTools[name];
  return tool.callback(args);
}

describe('registerEnvironmentTools', () => {
  it('registers list_environments and returns the client payload as text', async () => {
    const client = makeClient({
      get: vi.fn().mockResolvedValue([{ id: 1, name: 'production' }])
    });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerEnvironmentTools(server, client);

    const result = await callTool(server, 'list_environments', {});
    expect(client.get).toHaveBeenCalledWith('/api/environments');
    expect(result.content[0].text).toContain('production');
  });

  it('returns an isError result when the client throws', async () => {
    const client = makeClient({
      get: vi.fn().mockRejectedValue(new DockhandError(500, 'boom'))
    });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerEnvironmentTools(server, client);

    const result = await callTool(server, 'list_environments', {});
    expect(result.isError).toBe(true);
  });
});
```

**Note for implementer:** if `server._registeredTools` is not the actual internal property name on the installed `@modelcontextprotocol/server` version, inspect the installed package's `McpServer` class (`node_modules/@modelcontextprotocol/server/dist/*.d.ts` or source) for how to invoke a registered tool's handler directly for unit testing, and adjust the `callTool` helper in this file and every other `tools/*.test.ts` file in this plan accordingly. This same helper is reused unchanged in Tasks 6–10.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/tools/environments.test.ts`
Expected: FAIL — `src/tools/environments.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// src/tools/environments.ts
import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod';
import type { DockhandClient } from '../dockhandClient.js';
import { toErrorResult, toTextResult } from '../toolError.js';

export function registerEnvironmentTools(server: McpServer, client: DockhandClient): void {
  server.registerTool(
    'list_environments',
    {
      description: 'List all Dockhand environments (Docker hosts). Call this first to discover valid environmentId values for other tools.',
      inputSchema: z.object({})
    },
    async () => {
      try {
        const environments = await client.get('/api/environments');
        return toTextResult(environments);
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/tools/environments.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/tools/environments.ts tests/tools/environments.test.ts
git commit -m "feat: add list_environments MCP tool"
```

---

## Task 6: Container tools (`tools/containers.ts`)

**Files:**
- Create: `src/tools/containers.ts`
- Test: `tests/tools/containers.test.ts`

**Interfaces:**
- Consumes: `DockhandClient`, `toErrorResult`/`toTextResult`, `environmentIdSchema` (Task 4), the `callTool` test helper pattern from Task 5.
- Produces: `export function registerContainerTools(server: McpServer, client: DockhandClient, readonly: boolean): void` — registers `list_containers`, `get_container`, `get_container_logs` always; registers `start_container`, `stop_container`, `restart_container`, `remove_container` only when `readonly` is `false`.

Confirmed REST shapes (from `dockhand/src/routes/api/containers/`):
- `GET /api/containers?env=&all=` (both optional; `all` defaults to `true` server-side unless `all=false` is passed)
- `GET /api/containers/:id?env=`
- `GET /api/containers/:id/logs?env=&tail=&since=&until=` → `{ logs: string }`
- `POST /api/containers/:id/start?env=` → `{ success: true }`
- `POST /api/containers/:id/stop?env=` → `{ success: true }`
- `POST /api/containers/:id/restart?env=` → `{ success: true }`
- `DELETE /api/containers/:id?env=&force=` → `{ success: true }`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/tools/containers.test.ts
import { describe, it, expect, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/server';
import { registerContainerTools } from '../../src/tools/containers.js';
import type { DockhandClient } from '../../src/dockhandClient.js';

function makeClient(overrides: Partial<DockhandClient> = {}): DockhandClient {
  return { get: vi.fn(), post: vi.fn(), del: vi.fn(), ...overrides };
}

async function callTool(server: McpServer, name: string, args: Record<string, unknown>) {
  // @ts-expect-error accessing internal registry for direct unit testing
  const tool = server._registeredTools[name];
  return tool.callback(args);
}

function hasTool(server: McpServer, name: string): boolean {
  // @ts-expect-error accessing internal registry for direct unit testing
  return name in server._registeredTools;
}

describe('registerContainerTools — read-only tools', () => {
  it('list_containers passes environmentId and all through as query params', async () => {
    const client = makeClient({ get: vi.fn().mockResolvedValue([{ id: 'c1' }]) });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerContainerTools(server, client, false);

    await callTool(server, 'list_containers', { environmentId: 1, all: false });
    expect(client.get).toHaveBeenCalledWith('/api/containers', { env: 1, all: false });
  });

  it('get_container calls the inspect endpoint', async () => {
    const client = makeClient({ get: vi.fn().mockResolvedValue({ Id: 'c1' }) });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerContainerTools(server, client, false);

    await callTool(server, 'get_container', { environmentId: 1, containerId: 'c1' });
    expect(client.get).toHaveBeenCalledWith('/api/containers/c1', { env: 1 });
  });

  it('get_container_logs passes tail/since/until', async () => {
    const client = makeClient({ get: vi.fn().mockResolvedValue({ logs: 'log line' }) });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerContainerTools(server, client, false);

    await callTool(server, 'get_container_logs', { environmentId: 1, containerId: 'c1', tail: 200 });
    expect(client.get).toHaveBeenCalledWith('/api/containers/c1/logs', {
      env: 1,
      tail: 200,
      since: undefined,
      until: undefined
    });
  });
});

describe('registerContainerTools — mutating tools when readonly=false', () => {
  it('registers start_container, stop_container, restart_container, remove_container', () => {
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerContainerTools(server, makeClient(), false);
    expect(hasTool(server, 'start_container')).toBe(true);
    expect(hasTool(server, 'stop_container')).toBe(true);
    expect(hasTool(server, 'restart_container')).toBe(true);
    expect(hasTool(server, 'remove_container')).toBe(true);
  });

  it('start_container posts to the start endpoint', async () => {
    const client = makeClient({ post: vi.fn().mockResolvedValue({ success: true }) });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerContainerTools(server, client, false);

    await callTool(server, 'start_container', { environmentId: 1, containerId: 'c1' });
    expect(client.post).toHaveBeenCalledWith('/api/containers/c1/start', undefined, { env: 1 });
  });

  it('remove_container deletes with force param', async () => {
    const client = makeClient({ del: vi.fn().mockResolvedValue({ success: true }) });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerContainerTools(server, client, false);

    await callTool(server, 'remove_container', { environmentId: 1, containerId: 'c1', force: true });
    expect(client.del).toHaveBeenCalledWith('/api/containers/c1', { env: 1, force: true });
  });
});

describe('registerContainerTools — readonly=true', () => {
  it('does not register mutating tools', () => {
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerContainerTools(server, makeClient(), true);
    expect(hasTool(server, 'start_container')).toBe(false);
    expect(hasTool(server, 'stop_container')).toBe(false);
    expect(hasTool(server, 'restart_container')).toBe(false);
    expect(hasTool(server, 'remove_container')).toBe(false);
    expect(hasTool(server, 'list_containers')).toBe(true);
    expect(hasTool(server, 'get_container')).toBe(true);
    expect(hasTool(server, 'get_container_logs')).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/tools/containers.test.ts`
Expected: FAIL — `src/tools/containers.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// src/tools/containers.ts
import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod';
import type { DockhandClient } from '../dockhandClient.js';
import { toErrorResult, toTextResult } from '../toolError.js';
import { environmentIdSchema } from '../types.js';

export function registerContainerTools(server: McpServer, client: DockhandClient, readonly: boolean): void {
  server.registerTool(
    'list_containers',
    {
      description: 'List containers in a Dockhand environment.',
      inputSchema: z.object({
        environmentId: environmentIdSchema,
        all: z.boolean().optional().describe('Include stopped containers. Defaults to true.')
      })
    },
    async ({ environmentId, all }) => {
      try {
        const containers = await client.get('/api/containers', { env: environmentId, all });
        return toTextResult(containers);
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  server.registerTool(
    'get_container',
    {
      description: 'Get full inspect details for a single container.',
      inputSchema: z.object({
        environmentId: environmentIdSchema,
        containerId: z.string().describe('Container ID or name')
      })
    },
    async ({ environmentId, containerId }) => {
      try {
        const details = await client.get(`/api/containers/${encodeURIComponent(containerId)}`, { env: environmentId });
        return toTextResult(details);
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  server.registerTool(
    'get_container_logs',
    {
      description: 'Get recent logs for a container.',
      inputSchema: z.object({
        environmentId: environmentIdSchema,
        containerId: z.string(),
        tail: z.number().int().positive().optional().describe('Number of lines from the end of the logs. Defaults to 100.'),
        since: z.string().optional().describe('Only return logs since this timestamp (Unix seconds or RFC3339)'),
        until: z.string().optional().describe('Only return logs before this timestamp (Unix seconds or RFC3339)')
      })
    },
    async ({ environmentId, containerId, tail, since, until }) => {
      try {
        const result = await client.get(`/api/containers/${encodeURIComponent(containerId)}/logs`, {
          env: environmentId,
          tail,
          since,
          until
        });
        return toTextResult(result);
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  if (readonly) {
    return;
  }

  server.registerTool(
    'start_container',
    {
      description: 'Start a stopped container.',
      inputSchema: z.object({ environmentId: environmentIdSchema, containerId: z.string() })
    },
    async ({ environmentId, containerId }) => {
      try {
        const result = await client.post(`/api/containers/${encodeURIComponent(containerId)}/start`, undefined, {
          env: environmentId
        });
        return toTextResult(result);
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  server.registerTool(
    'stop_container',
    {
      description: 'Stop a running container.',
      inputSchema: z.object({ environmentId: environmentIdSchema, containerId: z.string() })
    },
    async ({ environmentId, containerId }) => {
      try {
        const result = await client.post(`/api/containers/${encodeURIComponent(containerId)}/stop`, undefined, {
          env: environmentId
        });
        return toTextResult(result);
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  server.registerTool(
    'restart_container',
    {
      description: 'Restart a container.',
      inputSchema: z.object({ environmentId: environmentIdSchema, containerId: z.string() })
    },
    async ({ environmentId, containerId }) => {
      try {
        const result = await client.post(`/api/containers/${encodeURIComponent(containerId)}/restart`, undefined, {
          env: environmentId
        });
        return toTextResult(result);
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  server.registerTool(
    'remove_container',
    {
      description: 'Remove (delete) a container.',
      inputSchema: z.object({
        environmentId: environmentIdSchema,
        containerId: z.string(),
        force: z.boolean().optional().describe('Force removal of a running container. Defaults to false.')
      })
    },
    async ({ environmentId, containerId, force }) => {
      try {
        const result = await client.del(`/api/containers/${encodeURIComponent(containerId)}`, {
          env: environmentId,
          force
        });
        return toTextResult(result);
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/tools/containers.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add src/tools/containers.ts tests/tools/containers.test.ts
git commit -m "feat: add container MCP tools"
```

---

## Task 7: Image tools (`tools/images.ts`)

**Files:**
- Create: `src/tools/images.ts`
- Test: `tests/tools/images.test.ts`

**Interfaces:**
- Consumes: same as Task 6.
- Produces: `export function registerImageTools(server: McpServer, client: DockhandClient, readonly: boolean): void` — registers `list_images` always; `pull_image`, `remove_image` only when `readonly` is `false`.

Confirmed REST shapes (from `dockhand/src/routes/api/images/`):
- `GET /api/images?env=`
- `POST /api/images/pull?env=` with body `{ image: string, scanAfterPull?: boolean }` — a job endpoint (see Global Constraints); with `Accept: application/json` it resolves synchronously to the final result (e.g. `{ status: 'complete' }` or `{ status: 'error', error }`).
- `DELETE /api/images/:id?env=&force=`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/tools/images.test.ts
import { describe, it, expect, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/server';
import { registerImageTools } from '../../src/tools/images.js';
import type { DockhandClient } from '../../src/dockhandClient.js';

function makeClient(overrides: Partial<DockhandClient> = {}): DockhandClient {
  return { get: vi.fn(), post: vi.fn(), del: vi.fn(), ...overrides };
}

async function callTool(server: McpServer, name: string, args: Record<string, unknown>) {
  // @ts-expect-error accessing internal registry for direct unit testing
  const tool = server._registeredTools[name];
  return tool.callback(args);
}

function hasTool(server: McpServer, name: string): boolean {
  // @ts-expect-error accessing internal registry for direct unit testing
  return name in server._registeredTools;
}

describe('registerImageTools', () => {
  it('list_images passes environmentId', async () => {
    const client = makeClient({ get: vi.fn().mockResolvedValue([{ Id: 'sha256:abc' }]) });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerImageTools(server, client, false);

    await callTool(server, 'list_images', { environmentId: 2 });
    expect(client.get).toHaveBeenCalledWith('/api/images', { env: 2 });
  });

  it('pull_image posts image name and scanAfterPull', async () => {
    const client = makeClient({ post: vi.fn().mockResolvedValue({ status: 'complete' }) });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerImageTools(server, client, false);

    const result = await callTool(server, 'pull_image', { environmentId: 2, image: 'nginx:latest', scanAfterPull: false });
    expect(client.post).toHaveBeenCalledWith('/api/images/pull', { image: 'nginx:latest', scanAfterPull: false }, { env: 2 });
    expect(result.content[0].text).toContain('complete');
  });

  it('remove_image deletes with force param', async () => {
    const client = makeClient({ del: vi.fn().mockResolvedValue({ success: true }) });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerImageTools(server, client, false);

    await callTool(server, 'remove_image', { environmentId: 2, imageId: 'sha256:abc', force: true });
    expect(client.del).toHaveBeenCalledWith('/api/images/sha256%3Aabc', { env: 2, force: true });
  });

  it('omits pull_image and remove_image when readonly', () => {
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerImageTools(server, makeClient(), true);
    expect(hasTool(server, 'pull_image')).toBe(false);
    expect(hasTool(server, 'remove_image')).toBe(false);
    expect(hasTool(server, 'list_images')).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/tools/images.test.ts`
Expected: FAIL — `src/tools/images.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// src/tools/images.ts
import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod';
import type { DockhandClient } from '../dockhandClient.js';
import { toErrorResult, toTextResult } from '../toolError.js';
import { environmentIdSchema } from '../types.js';

export function registerImageTools(server: McpServer, client: DockhandClient, readonly: boolean): void {
  server.registerTool(
    'list_images',
    {
      description: 'List images in a Dockhand environment.',
      inputSchema: z.object({ environmentId: environmentIdSchema })
    },
    async ({ environmentId }) => {
      try {
        const images = await client.get('/api/images', { env: environmentId });
        return toTextResult(images);
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  if (readonly) {
    return;
  }

  server.registerTool(
    'pull_image',
    {
      description: 'Pull an image from a registry. Blocks until the pull completes or fails.',
      inputSchema: z.object({
        environmentId: environmentIdSchema,
        image: z.string().describe('Image reference, e.g. nginx:latest'),
        scanAfterPull: z.boolean().optional().describe('Run a vulnerability scan after pulling, if a scanner is configured. Defaults to the environment setting.')
      })
    },
    async ({ environmentId, image, scanAfterPull }) => {
      try {
        const result = await client.post('/api/images/pull', { image, scanAfterPull }, { env: environmentId });
        return toTextResult(result);
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  server.registerTool(
    'remove_image',
    {
      description: 'Remove (delete) an image.',
      inputSchema: z.object({
        environmentId: environmentIdSchema,
        imageId: z.string().describe('Image ID or reference'),
        force: z.boolean().optional().describe('Force removal. Defaults to false.')
      })
    },
    async ({ environmentId, imageId, force }) => {
      try {
        const result = await client.del(`/api/images/${encodeURIComponent(imageId)}`, { env: environmentId, force });
        return toTextResult(result);
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/tools/images.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/tools/images.ts tests/tools/images.test.ts
git commit -m "feat: add image MCP tools"
```

---

## Task 8: Volume tools (`tools/volumes.ts`)

**Files:**
- Create: `src/tools/volumes.ts`
- Test: `tests/tools/volumes.test.ts`

**Interfaces:**
- Consumes: same as Task 6.
- Produces: `export function registerVolumeTools(server: McpServer, client: DockhandClient, readonly: boolean): void` — registers `list_volumes` always; `remove_volume` only when `readonly` is `false`.

Confirmed REST shapes (from `dockhand/src/routes/api/volumes/`):
- `GET /api/volumes?env=`
- `DELETE /api/volumes/:name?env=&force=`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/tools/volumes.test.ts
import { describe, it, expect, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/server';
import { registerVolumeTools } from '../../src/tools/volumes.js';
import type { DockhandClient } from '../../src/dockhandClient.js';

function makeClient(overrides: Partial<DockhandClient> = {}): DockhandClient {
  return { get: vi.fn(), post: vi.fn(), del: vi.fn(), ...overrides };
}

async function callTool(server: McpServer, name: string, args: Record<string, unknown>) {
  // @ts-expect-error accessing internal registry for direct unit testing
  const tool = server._registeredTools[name];
  return tool.callback(args);
}

function hasTool(server: McpServer, name: string): boolean {
  // @ts-expect-error accessing internal registry for direct unit testing
  return name in server._registeredTools;
}

describe('registerVolumeTools', () => {
  it('list_volumes passes environmentId', async () => {
    const client = makeClient({ get: vi.fn().mockResolvedValue([{ Name: 'data' }]) });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerVolumeTools(server, client, false);

    await callTool(server, 'list_volumes', { environmentId: 3 });
    expect(client.get).toHaveBeenCalledWith('/api/volumes', { env: 3 });
  });

  it('remove_volume deletes with force param', async () => {
    const client = makeClient({ del: vi.fn().mockResolvedValue({ success: true }) });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerVolumeTools(server, client, false);

    await callTool(server, 'remove_volume', { environmentId: 3, volumeName: 'data', force: true });
    expect(client.del).toHaveBeenCalledWith('/api/volumes/data', { env: 3, force: true });
  });

  it('omits remove_volume when readonly', () => {
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerVolumeTools(server, makeClient(), true);
    expect(hasTool(server, 'remove_volume')).toBe(false);
    expect(hasTool(server, 'list_volumes')).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/tools/volumes.test.ts`
Expected: FAIL — `src/tools/volumes.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// src/tools/volumes.ts
import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod';
import type { DockhandClient } from '../dockhandClient.js';
import { toErrorResult, toTextResult } from '../toolError.js';
import { environmentIdSchema } from '../types.js';

export function registerVolumeTools(server: McpServer, client: DockhandClient, readonly: boolean): void {
  server.registerTool(
    'list_volumes',
    {
      description: 'List volumes in a Dockhand environment.',
      inputSchema: z.object({ environmentId: environmentIdSchema })
    },
    async ({ environmentId }) => {
      try {
        const volumes = await client.get('/api/volumes', { env: environmentId });
        return toTextResult(volumes);
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  if (readonly) {
    return;
  }

  server.registerTool(
    'remove_volume',
    {
      description: 'Remove (delete) a volume.',
      inputSchema: z.object({
        environmentId: environmentIdSchema,
        volumeName: z.string(),
        force: z.boolean().optional().describe('Force removal. Defaults to false.')
      })
    },
    async ({ environmentId, volumeName, force }) => {
      try {
        const result = await client.del(`/api/volumes/${encodeURIComponent(volumeName)}`, { env: environmentId, force });
        return toTextResult(result);
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/tools/volumes.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/tools/volumes.ts tests/tools/volumes.test.ts
git commit -m "feat: add volume MCP tools"
```

---

## Task 9: Network tools (`tools/networks.ts`)

**Files:**
- Create: `src/tools/networks.ts`
- Test: `tests/tools/networks.test.ts`

**Interfaces:**
- Consumes: same as Task 6, minus the `readonly` flag (networks has no mutating tool in v1 — see spec Tool List, which lists only `list_networks`).
- Produces: `export function registerNetworkTools(server: McpServer, client: DockhandClient): void` — registers `list_networks`.

Confirmed REST shape: `GET /api/networks?env=`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/tools/networks.test.ts
import { describe, it, expect, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/server';
import { registerNetworkTools } from '../../src/tools/networks.js';
import type { DockhandClient } from '../../src/dockhandClient.js';

function makeClient(overrides: Partial<DockhandClient> = {}): DockhandClient {
  return { get: vi.fn(), post: vi.fn(), del: vi.fn(), ...overrides };
}

async function callTool(server: McpServer, name: string, args: Record<string, unknown>) {
  // @ts-expect-error accessing internal registry for direct unit testing
  const tool = server._registeredTools[name];
  return tool.callback(args);
}

describe('registerNetworkTools', () => {
  it('list_networks passes environmentId', async () => {
    const client = makeClient({ get: vi.fn().mockResolvedValue([{ Name: 'bridge' }]) });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerNetworkTools(server, client);

    await callTool(server, 'list_networks', { environmentId: 4 });
    expect(client.get).toHaveBeenCalledWith('/api/networks', { env: 4 });
  });

  it('returns isError on failure', async () => {
    const client = makeClient({ get: vi.fn().mockRejectedValue(new Error('down')) });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerNetworkTools(server, client);

    const result = await callTool(server, 'list_networks', { environmentId: 4 });
    expect(result.isError).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/tools/networks.test.ts`
Expected: FAIL — `src/tools/networks.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// src/tools/networks.ts
import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod';
import type { DockhandClient } from '../dockhandClient.js';
import { toErrorResult, toTextResult } from '../toolError.js';
import { environmentIdSchema } from '../types.js';

export function registerNetworkTools(server: McpServer, client: DockhandClient): void {
  server.registerTool(
    'list_networks',
    {
      description: 'List networks in a Dockhand environment.',
      inputSchema: z.object({ environmentId: environmentIdSchema })
    },
    async ({ environmentId }) => {
      try {
        const networks = await client.get('/api/networks', { env: environmentId });
        return toTextResult(networks);
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/tools/networks.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/tools/networks.ts tests/tools/networks.test.ts
git commit -m "feat: add list_networks MCP tool"
```

---

## Task 10: Stack tools (`tools/stacks.ts`)

**Files:**
- Create: `src/tools/stacks.ts`
- Test: `tests/tools/stacks.test.ts`

**Interfaces:**
- Consumes: same as Task 6.
- Produces: `export function registerStackTools(server: McpServer, client: DockhandClient, readonly: boolean): void` — registers `list_stacks` always; `deploy_stack`, `stop_stack` only when `readonly` is `false`.

Confirmed REST shapes (from `dockhand/src/routes/api/stacks/`):
- `GET /api/stacks?env=`
- `POST /api/stacks/:name/deploy?env=` with body `{ pull?: boolean, build?: boolean, forceRecreate?: boolean }` — job endpoint, resolves synchronously with `Accept: application/json`.
- `POST /api/stacks/:name/down?env=` with body `{ removeVolumes?: boolean }` — job endpoint, resolves synchronously with `Accept: application/json`. Note: the stack `name` is a path segment that Dockhand itself decodes via `decodeURIComponent(params.name)`, so this client must `encodeURIComponent` it when building the URL, matching the pattern used for container/image/volume IDs.

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/tools/stacks.test.ts
import { describe, it, expect, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/server';
import { registerStackTools } from '../../src/tools/stacks.js';
import type { DockhandClient } from '../../src/dockhandClient.js';

function makeClient(overrides: Partial<DockhandClient> = {}): DockhandClient {
  return { get: vi.fn(), post: vi.fn(), del: vi.fn(), ...overrides };
}

async function callTool(server: McpServer, name: string, args: Record<string, unknown>) {
  // @ts-expect-error accessing internal registry for direct unit testing
  const tool = server._registeredTools[name];
  return tool.callback(args);
}

function hasTool(server: McpServer, name: string): boolean {
  // @ts-expect-error accessing internal registry for direct unit testing
  return name in server._registeredTools;
}

describe('registerStackTools', () => {
  it('list_stacks passes environmentId', async () => {
    const client = makeClient({ get: vi.fn().mockResolvedValue([{ name: 'my-app' }]) });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerStackTools(server, client, false);

    await callTool(server, 'list_stacks', { environmentId: 5 });
    expect(client.get).toHaveBeenCalledWith('/api/stacks', { env: 5 });
  });

  it('deploy_stack posts options and encodes the stack name', async () => {
    const client = makeClient({ post: vi.fn().mockResolvedValue({ success: true }) });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerStackTools(server, client, false);

    await callTool(server, 'deploy_stack', {
      environmentId: 5,
      stackName: 'my app',
      pull: true,
      build: false,
      forceRecreate: false
    });
    expect(client.post).toHaveBeenCalledWith(
      '/api/stacks/my%20app/deploy',
      { pull: true, build: false, forceRecreate: false },
      { env: 5 }
    );
  });

  it('stop_stack posts removeVolumes', async () => {
    const client = makeClient({ post: vi.fn().mockResolvedValue({ success: true }) });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerStackTools(server, client, false);

    await callTool(server, 'stop_stack', { environmentId: 5, stackName: 'my-app', removeVolumes: true });
    expect(client.post).toHaveBeenCalledWith('/api/stacks/my-app/down', { removeVolumes: true }, { env: 5 });
  });

  it('omits deploy_stack and stop_stack when readonly', () => {
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerStackTools(server, makeClient(), true);
    expect(hasTool(server, 'deploy_stack')).toBe(false);
    expect(hasTool(server, 'stop_stack')).toBe(false);
    expect(hasTool(server, 'list_stacks')).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/tools/stacks.test.ts`
Expected: FAIL — `src/tools/stacks.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// src/tools/stacks.ts
import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod';
import type { DockhandClient } from '../dockhandClient.js';
import { toErrorResult, toTextResult } from '../toolError.js';
import { environmentIdSchema } from '../types.js';

export function registerStackTools(server: McpServer, client: DockhandClient, readonly: boolean): void {
  server.registerTool(
    'list_stacks',
    {
      description: 'List Compose stacks in a Dockhand environment.',
      inputSchema: z.object({ environmentId: environmentIdSchema })
    },
    async ({ environmentId }) => {
      try {
        const stacks = await client.get('/api/stacks', { env: environmentId });
        return toTextResult(stacks);
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  if (readonly) {
    return;
  }

  server.registerTool(
    'deploy_stack',
    {
      description: 'Deploy (up) a Compose stack. Blocks until the deploy completes or fails.',
      inputSchema: z.object({
        environmentId: environmentIdSchema,
        stackName: z.string(),
        pull: z.boolean().optional().describe('Pull images before deploying. Defaults to false.'),
        build: z.boolean().optional().describe('Build images before deploying. Defaults to false.'),
        forceRecreate: z.boolean().optional().describe('Force recreation of containers. Defaults to false.')
      })
    },
    async ({ environmentId, stackName, pull, build, forceRecreate }) => {
      try {
        const result = await client.post(
          `/api/stacks/${encodeURIComponent(stackName)}/deploy`,
          { pull, build, forceRecreate },
          { env: environmentId }
        );
        return toTextResult(result);
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  server.registerTool(
    'stop_stack',
    {
      description: 'Stop (down) a Compose stack. Blocks until it completes or fails.',
      inputSchema: z.object({
        environmentId: environmentIdSchema,
        stackName: z.string(),
        removeVolumes: z.boolean().optional().describe('Also remove named volumes declared in the stack. Defaults to false.')
      })
    },
    async ({ environmentId, stackName, removeVolumes }) => {
      try {
        const result = await client.post(
          `/api/stacks/${encodeURIComponent(stackName)}/down`,
          { removeVolumes },
          { env: environmentId }
        );
        return toTextResult(result);
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/tools/stacks.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/tools/stacks.ts tests/tools/stacks.test.ts
git commit -m "feat: add stack MCP tools"
```

---

## Task 11: Server wiring (`server.ts`)

**Files:**
- Create: `src/server.ts`
- Test: `tests/server.test.ts`

**Interfaces:**
- Consumes: all `registerXTools` functions from Tasks 5–10, `DockhandClient`.
- Produces: `export function buildServer(client: DockhandClient, readonly: boolean): McpServer` — constructs one `McpServer` and calls every register function.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/server.test.ts
import { describe, it, expect, vi } from 'vitest';
import { buildServer } from '../src/server.js';
import type { DockhandClient } from '../src/dockhandClient.js';

function makeClient(): DockhandClient {
  return { get: vi.fn(), post: vi.fn(), del: vi.fn() };
}

function toolNames(server: ReturnType<typeof buildServer>): string[] {
  // @ts-expect-error accessing internal registry for direct unit testing
  return Object.keys(server._registeredTools);
}

describe('buildServer', () => {
  it('registers every read-only tool plus every mutating tool when readonly=false', () => {
    const server = buildServer(makeClient(), false);
    const names = toolNames(server);
    expect(names).toEqual(
      expect.arrayContaining([
        'list_environments',
        'list_containers',
        'get_container',
        'get_container_logs',
        'start_container',
        'stop_container',
        'restart_container',
        'remove_container',
        'list_images',
        'pull_image',
        'remove_image',
        'list_volumes',
        'remove_volume',
        'list_networks',
        'list_stacks',
        'deploy_stack',
        'stop_stack'
      ])
    );
    expect(names).toHaveLength(17);
  });

  it('omits mutating tools when readonly=true', () => {
    const server = buildServer(makeClient(), true);
    const names = toolNames(server);
    expect(names).toEqual(
      expect.arrayContaining([
        'list_environments',
        'list_containers',
        'get_container',
        'get_container_logs',
        'list_images',
        'list_volumes',
        'list_networks',
        'list_stacks'
      ])
    );
    expect(names).toHaveLength(8);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/server.test.ts`
Expected: FAIL — `src/server.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// src/server.ts
import { McpServer } from '@modelcontextprotocol/server';
import type { DockhandClient } from './dockhandClient.js';
import { registerEnvironmentTools } from './tools/environments.js';
import { registerContainerTools } from './tools/containers.js';
import { registerImageTools } from './tools/images.js';
import { registerVolumeTools } from './tools/volumes.js';
import { registerNetworkTools } from './tools/networks.js';
import { registerStackTools } from './tools/stacks.js';

export function buildServer(client: DockhandClient, readonly: boolean): McpServer {
  const server = new McpServer({ name: 'dockhand-mcp', version: '0.1.0' });

  registerEnvironmentTools(server, client);
  registerContainerTools(server, client, readonly);
  registerImageTools(server, client, readonly);
  registerVolumeTools(server, client, readonly);
  registerNetworkTools(server, client);
  registerStackTools(server, client, readonly);

  return server;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/server.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/server.ts tests/server.test.ts
git commit -m "feat: wire up MCP server with all tool registrations"
```

---

## Task 12: Inbound auth middleware (`auth.ts`)

**Files:**
- Create: `src/auth.ts`
- Test: `tests/auth.test.ts`

**Interfaces:**
- Produces: `export function requireMcpAuthToken(expectedToken: string): express.RequestHandler` — an Express middleware that checks `Authorization: Bearer <token>` against `expectedToken`, calling `next()` on match and responding `401` with a small JSON body otherwise.

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/auth.test.ts
import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import { requireMcpAuthToken } from '../src/auth.js';

function makeReqRes(authHeader?: string) {
  const req = { headers: authHeader ? { authorization: authHeader } : {} } as Request;
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis()
  } as unknown as Response;
  const next = vi.fn();
  return { req, res, next };
}

describe('requireMcpAuthToken', () => {
  it('calls next() when the bearer token matches', () => {
    const middleware = requireMcpAuthToken('secret123');
    const { req, res, next } = makeReqRes('Bearer secret123');
    middleware(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('responds 401 when the header is missing', () => {
    const middleware = requireMcpAuthToken('secret123');
    const { req, res, next } = makeReqRes(undefined);
    middleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('responds 401 when the token does not match', () => {
    const middleware = requireMcpAuthToken('secret123');
    const { req, res, next } = makeReqRes('Bearer wrong');
    middleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('responds 401 when the scheme is not Bearer', () => {
    const middleware = requireMcpAuthToken('secret123');
    const { req, res, next } = makeReqRes('Basic secret123');
    middleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/auth.test.ts`
Expected: FAIL — `src/auth.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// src/auth.ts
import type { NextFunction, Request, RequestHandler, Response } from 'express';

export function requireMcpAuthToken(expectedToken: string): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || token !== expectedToken) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    next();
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/auth.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/auth.ts tests/auth.test.ts
git commit -m "feat: add inbound MCP_AUTH_TOKEN middleware"
```

---

## Task 13: Express app wiring (`app.ts`) and entrypoint (`index.ts`)

**Files:**
- Create: `src/app.ts`
- Modify: `src/index.ts` (replace placeholder from Task 1)

**Interfaces:**
- Consumes: `buildServer` (Task 11), `requireMcpAuthToken` (Task 12), `loadConfig`/`ConfigError` (Task 2), `createDockhandClient` (Task 3).
- Produces: `export function createApp(config: Config): Express` in `app.ts`; `index.ts` loads config, builds the client + server, creates the app, and listens on `config.port`.

This task has no dedicated unit test — it is thin wiring covered end-to-end by Task 14's smoke test. Manual verification (Step 4 below) substitutes for a unit test here per the plan's testing strategy.

- [ ] **Step 1: Write `src/app.ts`**

```typescript
// src/app.ts
import { createMcpExpressApp } from '@modelcontextprotocol/express';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { createMcpHandler } from '@modelcontextprotocol/server';
import type { Express } from 'express';
import type { Config } from './config.js';
import { createDockhandClient } from './dockhandClient.js';
import { buildServer } from './server.js';
import { requireMcpAuthToken } from './auth.js';

export function createApp(config: Config): Express {
  const client = createDockhandClient(config);
  const app = createMcpExpressApp({ host: '0.0.0.0', allowedHosts: ['*'] });

  const node = toNodeHandler(createMcpHandler(() => buildServer(client, config.readonly)));

  app.all('/mcp', requireMcpAuthToken(config.mcpAuthToken), (req, res) => void node(req, res, req.body));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  return app;
}
```

**Note for implementer:** `allowedHosts: ['*']` disables `@modelcontextprotocol/express`'s DNS-rebinding host check, which is appropriate for a sidecar reached only over a private Docker network by hostname (e.g. `dockhand-mcp`), where the exact hostname isn't known in advance. If the installed version of `@modelcontextprotocol/express` does not accept `'*'` as a wildcard, instead read an optional `MCP_ALLOWED_HOSTS` env var (comma-separated) in `config.ts` and pass that list through here — check the package's actual `allowedHosts` type/behavior (`node_modules/@modelcontextprotocol/express/dist/*.d.ts`) before deciding, and update `config.ts`/`Config`/this file together if a change is needed.

- [ ] **Step 2: Write `src/index.ts`**

```typescript
// src/index.ts
import { loadConfig, ConfigError } from './config.js';
import { createApp } from './app.js';

try {
  const config = loadConfig(process.env);
  const app = createApp(config);
  app.listen(config.port, () => {
    console.log(`dockhand-mcp listening on :${config.port} (readonly=${config.readonly})`);
  });
} catch (error) {
  if (error instanceof ConfigError) {
    console.error(`Configuration error: ${error.message}`);
  } else {
    console.error('Failed to start dockhand-mcp:', error);
  }
  process.exit(1);
}
```

- [ ] **Step 3: Build and manually verify startup**

Run: `npm run build`
Expected: no TypeScript errors.

Run: `DOCKHAND_URL=http://localhost:3000 DOCKHAND_API_TOKEN=dh_fake MCP_AUTH_TOKEN=testsecret npm run dev` briefly (then Ctrl-C, or `timeout 5`)
Expected: prints `dockhand-mcp listening on :8787 (readonly=false)` with no crash. (It's fine that no real Dockhand instance is running — nothing calls out at startup.)

Run the same command without `MCP_AUTH_TOKEN` set:
Expected: prints `Configuration error: MCP_AUTH_TOKEN is required` and exits non-zero.

- [ ] **Step 4: Commit**

```bash
git add src/app.ts src/index.ts
git commit -m "feat: wire Express app and entrypoint"
```

---

## Task 14: End-to-end smoke test

**Files:**
- Create: `tests/e2e.test.ts`

**Interfaces:**
- Consumes: `createApp` (Task 13), `msw` to mock the Dockhand backend, `supertest` (new dev dependency) to drive the Express app in-process.

This is the one test in the suite that exercises the full stack — Express → auth middleware → MCP Streamable HTTP handler → tool → `dockhandClient` — using a real (mocked) Dockhand HTTP backend, catching any wiring mistakes the per-unit tests in Tasks 2–13 can't.

- [ ] **Step 1: Add `supertest` dev dependency**

```bash
npm install -D supertest @types/supertest
```

- [ ] **Step 2: Write the failing test**

```typescript
// tests/e2e.test.ts
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import request from 'supertest';
import { createApp } from '../src/app.js';

const dockhandServer = setupServer();
beforeAll(() => dockhandServer.listen({ onUnhandledRequest: 'error' }));
afterEach(() => dockhandServer.resetHandlers());
afterAll(() => dockhandServer.close());

const app = createApp({
  dockhandUrl: 'http://dockhand:3000',
  dockhandApiToken: 'dh_test',
  mcpAuthToken: 'testsecret',
  readonly: false,
  port: 8787
});

describe('dockhand-mcp Express app', () => {
  it('GET /health returns ok without auth', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('rejects /mcp requests without a valid MCP_AUTH_TOKEN', async () => {
    const res = await request(app)
      .post('/mcp')
      .set('Content-Type', 'application/json')
      .send({ jsonrpc: '2.0', method: 'tools/list', id: 1 });
    expect(res.status).toBe(401);
  });

  it('lists tools and calls list_environments end-to-end through the mocked Dockhand API', async () => {
    dockhandServer.use(
      http.get('http://dockhand:3000/api/environments', () => HttpResponse.json([{ id: 1, name: 'production' }]))
    );

    const initRes = await request(app)
      .post('/mcp')
      .set('Authorization', 'Bearer testsecret')
      .set('Content-Type', 'application/json')
      .set('Accept', 'application/json, text/event-stream')
      .send({
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '0.0.0' }
        },
        id: 1
      });
    expect(initRes.status).toBe(200);

    const sessionId = initRes.headers['mcp-session-id'];

    const callRes = await request(app)
      .post('/mcp')
      .set('Authorization', 'Bearer testsecret')
      .set('Content-Type', 'application/json')
      .set('Accept', 'application/json, text/event-stream')
      .set(sessionId ? { 'Mcp-Session-Id': sessionId } : {})
      .send({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: { name: 'list_environments', arguments: {} },
        id: 2
      });

    expect(callRes.status).toBe(200);
    expect(callRes.text).toContain('production');
  });
});
```

**Note for implementer:** the MCP Streamable HTTP handshake (whether a session ID is required, exact required headers, and whether the response is plain JSON vs. an SSE-framed body even for `Accept: application/json, text/event-stream`) depends on the exact installed version of `@modelcontextprotocol/server`/`@modelcontextprotocol/node`. If this test doesn't pass as written, consult that package's own test fixtures or `docs/serving/` examples (via context7, library ID `/modelcontextprotocol/typescript-sdk`, query "Streamable HTTP client request/response example initialize and tools/call") for the exact request/response shape, and adjust the request headers/body and response assertions here accordingly — the fix belongs in this test file, not in `app.ts`, unless the wiring itself is wrong.

- [ ] **Step 3: Run test to verify it fails first (if applicable), then iterate to passing**

Run: `npm test -- tests/e2e.test.ts`
Expected: initially may fail on handshake details per the note above; adjust the test until all 3 cases pass without changing `app.ts`'s actual behavior (only adjusting how the test drives it).

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: PASS — all tests across all files (config, dockhandClient, toolError, tools/*, server, auth, e2e).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json tests/e2e.test.ts
git commit -m "test: add end-to-end smoke test for the Express + MCP stack"
```

---

## Task 15: Dockerfile and compose example

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.example.yaml`
- Create: `.dockerignore`

**Interfaces:**
- Consumes: `npm run build` (Task 1) producing `dist/`.
- Produces: a buildable, runnable container image.

- [ ] **Step 1: Write `.dockerignore`**

```
node_modules
dist
tests
docs
.git
.gitignore
*.md
```

- [ ] **Step 2: Write `Dockerfile`**

```dockerfile
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
USER node
EXPOSE 8787
CMD ["node", "dist/index.js"]
```

- [ ] **Step 3: Write `docker-compose.example.yaml`**

```yaml
services:
  dockhand:
    image: fnsys/dockhand:latest
    ports:
      - "3000:3000"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - dockhand_data:/app/data

  dockhand-mcp:
    build: .
    depends_on:
      - dockhand
    environment:
      DOCKHAND_URL: http://dockhand:3000
      DOCKHAND_API_TOKEN_FILE: /run/secrets/dockhand_api_token
      MCP_AUTH_TOKEN: ${MCP_AUTH_TOKEN}
      DOCKHAND_MCP_READONLY: "false"
    secrets:
      - dockhand_api_token
    ports:
      - "8787:8787"

volumes:
  dockhand_data:

secrets:
  dockhand_api_token:
    file: ./dockhand_api_token.txt
```

- [ ] **Step 4: Build the image**

Run: `docker build -t dockhand-mcp:local .`
Expected: image builds successfully with no errors.

- [ ] **Step 5: Run the container and verify startup**

Run: `docker run --rm -e DOCKHAND_URL=http://dockhand:3000 -e DOCKHAND_API_TOKEN=dh_fake -e MCP_AUTH_TOKEN=testsecret -p 8787:8787 dockhand-mcp:local` briefly (Ctrl-C after confirming), or in the background then `docker logs`/`docker stop`.
Expected: log line `dockhand-mcp listening on :8787 (readonly=false)`; `curl http://localhost:8787/health` returns `{"status":"ok"}`.

- [ ] **Step 6: Commit**

```bash
git add Dockerfile docker-compose.example.yaml .dockerignore
git commit -m "chore: add Dockerfile and compose example"
```

---

## Task 16: README

**Files:**
- Create: `README.md`

**Interfaces:**
- None — documentation only.

- [ ] **Step 1: Write `README.md`**

```markdown
# dockhand-mcp

MCP (Model Context Protocol) sidecar server for [Dockhand](https://dockhand.pro). Exposes Dockhand's container, image, volume, network, and stack management as MCP tools over Streamable HTTP, so MCP clients (Claude Desktop, Claude Code, etc.) can manage Docker resources through Dockhand.

This is a standalone service — it does not modify Dockhand itself, and calls Dockhand's existing REST API using a Dockhand API token.

## Configuration

| Var | Required | Description |
|---|---|---|
| `DOCKHAND_URL` | yes | Base URL of the Dockhand instance, e.g. `http://dockhand:3000` |
| `DOCKHAND_API_TOKEN` | one of these two | Dockhand API token (create one in Dockhand under Settings → Auth → API Tokens) |
| `DOCKHAND_API_TOKEN_FILE` | one of these two | Path to a file/Docker secret containing the token |
| `MCP_AUTH_TOKEN` | yes | Shared secret required by MCP clients calling this sidecar |
| `DOCKHAND_MCP_READONLY` | no (default `false`) | Set `true` to only register read/list/inspect tools |
| `PORT` | no (default `8787`) | Port the MCP endpoint listens on |

## Running

```bash
docker build -t dockhand-mcp .
docker run -p 8787:8787 \
  -e DOCKHAND_URL=http://dockhand:3000 \
  -e DOCKHAND_API_TOKEN=dh_... \
  -e MCP_AUTH_TOKEN=... \
  dockhand-mcp
```

See `docker-compose.example.yaml` for running alongside Dockhand itself.

## MCP endpoint

`POST /mcp` — Streamable HTTP MCP endpoint. Requires `Authorization: Bearer <MCP_AUTH_TOKEN>`.

`GET /health` — unauthenticated liveness check.

## Tools

Every tool except `list_environments` requires an `environmentId` — call `list_environments` first to discover valid IDs.

Read-only: `list_environments`, `list_containers`, `get_container`, `get_container_logs`, `list_images`, `list_volumes`, `list_networks`, `list_stacks`

Mutating (disabled when `DOCKHAND_MCP_READONLY=true`): `start_container`, `stop_container`, `restart_container`, `remove_container`, `pull_image`, `remove_image`, `remove_volume`, `deploy_stack`, `stop_stack`

## Development

```bash
npm install
npm run dev     # watch mode
npm test        # run tests
npm run build   # compile to dist/
```
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README"
```

---

## Self-Review Notes (already applied above)

- **Spec coverage:** every config var, every tool in the spec's Tool List, the job-endpoint/`Accept` behavior, the two auth layers, `DOCKHAND_MCP_READONLY`, Dockerfile, and compose example each map to a task above.
- **No placeholders:** every step has real, runnable code; the two "Note for implementer" callouts (Task 5's `_registeredTools` access path and Task 14's handshake details) flag genuine external unknowns — the exact private/internal shape of a third-party package at install time — not missing design decisions, and each gives a concrete fallback action.
- **Type consistency:** `DockhandClient`, `Config`, `McpToolResult`, and every `registerXTools(server, client, ...)` signature are used identically across all tasks that reference them.
