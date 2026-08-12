// tests/tools/users.test.ts
import { describe, it, expect, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/server';
import { registerUserTools } from '../../src/tools/users.js';
import { DockhandError, type DockhandClient } from '../../src/dockhandClient.js';

function makeClient(overrides: Partial<DockhandClient> = {}): DockhandClient {
  return { get: vi.fn(), post: vi.fn(), del: vi.fn(), ...overrides };
}

async function callTool(server: McpServer, name: string, args: Record<string, unknown>) {
  // @ts-expect-error accessing internal registry for direct unit testing
  const tool = server._registeredTools[name];
  return tool.handler(args);
}

describe('registerUserTools', () => {
  it('list_users calls /api/users with no params', async () => {
    const client = makeClient({ get: vi.fn().mockResolvedValue([{ id: 1, username: 'admin' }]) });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerUserTools(server, client);

    await callTool(server, 'list_users', {});
    expect(client.get).toHaveBeenCalledWith('/api/users');
  });

  it('get_user calls /api/users/:id', async () => {
    const client = makeClient({ get: vi.fn().mockResolvedValue({ id: 7, username: 'bob' }) });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerUserTools(server, client);

    await callTool(server, 'get_user', { userId: 7 });
    expect(client.get).toHaveBeenCalledWith('/api/users/7');
  });

  it('list_roles calls /api/roles with no params', async () => {
    const client = makeClient({ get: vi.fn().mockResolvedValue([{ id: 1, name: 'admin' }]) });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerUserTools(server, client);

    await callTool(server, 'list_roles', {});
    expect(client.get).toHaveBeenCalledWith('/api/roles');
  });

  it('list_roles surfaces a 403 Enterprise-required error as isError, not a throw', async () => {
    const client = makeClient({
      get: vi.fn().mockRejectedValue(new DockhandError(403, 'Enterprise license required'))
    });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerUserTools(server, client);

    const result = await callTool(server, 'list_roles', {});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Enterprise license required');
  });
});
