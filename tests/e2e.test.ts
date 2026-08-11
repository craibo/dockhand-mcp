// tests/e2e.test.ts
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import request from 'supertest';
import { createApp } from '../src/app.js';

// `supertest` drives `createApp()`'s Express app over a real ephemeral TCP
// listener (`http.createServer(app).listen(0)`), not an in-memory transport.
// msw's Node interceptor patches at the `http`/`net` module level, so a
// blanket `onUnhandledRequest: 'error'` (as used in the other test files,
// which only ever call `dockhandClient` directly) also intercepts — and
// errors on — every supertest request into the app itself. Scope the
// "unhandled" check to the mocked Dockhand backend's origin only, so
// supertest's own traffic passes through untouched.
const dockhandServer = setupServer();
beforeAll(() =>
  dockhandServer.listen({
    onUnhandledRequest: (req, print) => {
      if (new URL(req.url).origin === 'http://dockhand:3000') {
        print.error();
      }
    }
  })
);
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

    // The server's `initialize` and `tools/call` responses for the 2025-06-18
    // ("legacy") protocol revision are served over its SSE-framed streamable
    // HTTP transport (`content-type: text/event-stream`) even though the
    // request's Accept header includes `application/json` — this handler
    // never returns a bare `application/json` body for these methods. The
    // body is an `event: message\ndata: <json>\n\n` frame; parse the JSON
    // out of the `data:` line rather than expecting supertest to auto-parse
    // `res.body`.
    expect(initRes.headers['content-type']).toContain('text/event-stream');
    const initMessage = parseSseJson(initRes.text);
    expect(initMessage.result.serverInfo).toEqual({ name: 'dockhand-mcp', version: '0.1.0' });

    // This server's default `legacy: 'stateless'` posture serves each
    // 2025-era request independently (a fresh server instance per request,
    // `sessionIdGenerator: undefined`), so no `Mcp-Session-Id` header is
    // ever issued for this protocol revision. Forwarding a session header
    // when one exists keeps this test correct if that posture changes.
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

/** Parses the JSON payload out of a single-event SSE response body (`event: message\ndata: {...}\n\n`). */
function parseSseJson(sseBody: string): any {
  const dataLine = sseBody.split('\n').find((line) => line.startsWith('data: '));
  if (!dataLine) {
    throw new Error(`No SSE data line found in body: ${sseBody}`);
  }
  return JSON.parse(dataLine.slice('data: '.length));
}
