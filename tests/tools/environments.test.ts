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
  return tool.handler(args);
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
