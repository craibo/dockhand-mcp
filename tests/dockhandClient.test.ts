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
